// Crawl: robots.txt → sitemaps → pages (BFS from the start URL, sitemap URLs fill the rest) → status of every internal link.
import { fetchChain, pool } from "./fetch.mjs";
import { extract } from "./html.mjs";
import { isAllowed, parseRobots } from "./robots.mjs";

export function parseSitemap(xml) {
  const locs = (tag) => [...xml.matchAll(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "gi"))].map((m) => m[0]);
  const val = (block, name) => block.match(new RegExp(`<${name}>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</${name}>`, "i"))?.[1]?.trim() ?? null;
  const decode = (s) => s?.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  return {
    sitemaps: locs("sitemap").map((b) => decode(val(b, "loc"))).filter(Boolean),
    urls: locs("url").map((b) => ({ loc: decode(val(b, "loc")), lastmod: val(b, "lastmod") })).filter((u) => u.loc),
  };
}

export async function readSitemaps(starts, { ua, limit = 50000, log = () => {} } = {}) {
  const seen = new Set();
  const urls = new Map();
  const problems = [];
  const queue = [...starts];
  while (queue.length && seen.size < 200) {
    const sm = queue.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);
    const r = await fetchChain(sm, { ua });
    if (r.status !== 200) {
      problems.push({ sitemap: sm, status: r.status });
      continue;
    }
    if (/\.gz$/i.test(sm)) {
      problems.push({ sitemap: sm, status: r.status, note: "gzip sitemap not read" });
      continue;
    }
    const p = parseSitemap(r.body);
    log(`sitemap ${sm}: ${p.urls.length} url, ${p.sitemaps.length} child`);
    queue.push(...p.sitemaps);
    for (const u of p.urls) if (urls.size < limit) urls.set(u.loc, u.lastmod);
  }
  return { sitemaps: [...seen], urls, problems };
}

export const sameSite = (a, b) => new URL(a).host.replace(/^www\./, "") === new URL(b).host.replace(/^www\./, "");
export const isPageLike = (u) => !/\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|css|js|mjs|json|xml|txt|zip|gz|mp4|mp3|woff2?|ttf)(\?|$)/i.test(new URL(u).pathname);

const CHALLENGE = /captcha|challenge|verify you are human|robot olmadığ|doğrulama|just a moment|access denied|attention required/i;

/**
 * URLs that got a bot wall instead of the page: WAF status codes with challenge markers, or the same noindex page
 * (identical title) served for many different URLs — the shape of an app-level "verify you're human" screen.
 */
export function botWalled(pages) {
  const out = new Set();
  const byTitle = new Map();
  for (const [u, p] of pages) {
    const h = JSON.stringify(p.fetch.headers ?? {});
    if ([403, 429, 503].includes(p.fetch.status) && (CHALLENGE.test(h) || /cf-mitigated|cf-ray/i.test(h))) out.add(u);
    const f = p.facts;
    if (!f) continue;
    const ni = /noindex/.test(`${f.robots} ${p.fetch.headers?.["x-robots-tag"] ?? ""}`);
    // A challenge screen is short; a noindex tool page filled in by JavaScript (?a=x) can be byte-identical across
    // URLs too, but it carries the tool's full text.
    if (ni && f.title && (f.wordCount ?? 0) < 150) byTitle.set(f.title, [...(byTitle.get(f.title) ?? []), u]);
  }
  // Many URLs with one noindex title are a wall only when they also serve the same screen: a challenge page has the
  // same size everywhere, while parameterised noindex tool pages (?a=x) share a title but differ in content.
  const sameScreen = (us) => {
    const sizes = us.map((u) => pages.get(u)?.fetch.size ?? 0);
    const max = Math.max(...sizes);
    return !max || (max - Math.min(...sizes)) / max < 0.02;
  };
  for (const [title, us] of byTitle) if (us.length >= 3 && (CHALLENGE.test(title) || (us.length >= 10 && sameScreen(us)))) us.forEach((u) => out.add(u));
  return [...out];
}

/**
 * Asks for an address that cannot exist. A site that answers 200 (or sends it to the home page) has no real 404:
 * every mistyped or deleted URL looks like a live page to Google (site-wide soft 404).
 */
export async function notFoundProbe(origin, { ua } = {}) {
  const url = `${origin}/zoro-yok-${Math.random().toString(36).slice(2, 10)}`;
  const r = await fetchChain(url, { ua });
  const html = r.status === 200 && /html/.test(r.headers["content-type"] ?? "") ? extract(r.body, r.finalUrl) : null;
  return { url, status: r.status, finalUrl: r.finalUrl, chain: r.chain, title: html?.title ?? null, noindex: /noindex/.test(`${html?.robots ?? ""} ${r.headers["x-robots-tag"] ?? ""}`) };
}

export async function crawl(start, { max = 50, concurrency = 4, delay = 100, ua, checkLinks = 300, wallPause = 30000, wallDelay = 1500, log = () => {} } = {}) {
  const origin = new URL(start).origin;
  const robotsRes = await fetchChain(origin + "/robots.txt", { ua });
  const robots = parseRobots(robotsRes.status === 200 ? robotsRes.body : "");
  const robotsTxt = { status: robotsRes.status, type: robotsRes.headers["content-type"] ?? "", body: robotsRes.status === 200 ? robotsRes.body : "", bytes: Buffer.byteLength(robotsRes.body ?? "") };
  const notFound = await notFoundProbe(origin, { ua });
  const sm = await readSitemaps(robots.sitemaps.length ? robots.sitemaps : [origin + "/sitemap.xml"], { ua, log });

  const pages = new Map();
  const queued = new Set([start]);
  let frontier = [start];
  // Sitemap URLs on another host (a sitemap built with the wrong base URL) are reported, not crawled as this site.
  const sitemapRest = [...sm.urls.keys()].filter((u) => !queued.has(u) && sameSite(u, start));
  while (pages.size < max && (frontier.length || sitemapRest.length)) {
    if (!frontier.length) frontier = sitemapRest.splice(0, max - pages.size).filter((u) => !pages.has(u));
    const batch = frontier.splice(0, Math.min(max - pages.size, concurrency * 4));
    const results = await pool(batch, concurrency, (u) => fetchChain(u, { ua }), { delay });
    for (const r of results) {
      const page = { fetch: { status: r.status, finalUrl: r.finalUrl, chain: r.chain, headers: r.headers, ms: r.ms, size: r.body?.length ?? 0 }, facts: null };
      // A redirecting URL is recorded as a redirect only; its target is crawled under its own URL (no double counting).
      if (r.chain.length > 1 && sameSite(r.finalUrl, start) && !queued.has(r.finalUrl)) {
        queued.add(r.finalUrl);
        frontier.push(r.finalUrl);
      } else if (r.chain.length === 1 && r.status === 200 && /html/.test(r.headers["content-type"] ?? "")) page.facts = extract(r.body, r.finalUrl);
      pages.set(r.url, page);
      log(`${pages.size}/${max} ${r.status} ${r.url}`);
      for (const l of page.facts?.links ?? []) {
        if (!l.href || !sameSite(l.href, start) || !isPageLike(l.href) || queued.has(l.href)) continue;
        if (!isAllowed(robots, "Googlebot", l.href)) continue;
        queued.add(l.href);
        frontier.push(l.href);
      }
    }
  }

  // Bot walls: retry slowly once; what still looks blocked is marked and kept out of the page rules.
  let walled = botWalled(pages);
  if (walled.length) {
    log(`bot wall suspected on ${walled.length} page(s); retrying slowly`);
    await new Promise((r) => setTimeout(r, wallPause));
    for (const u of walled.slice(0, 200)) {
      const r = await fetchChain(u, { ua });
      const p = pages.get(u);
      p.fetch = { status: r.status, finalUrl: r.finalUrl, chain: r.chain, headers: r.headers, ms: r.ms };
      p.facts = r.chain.length === 1 && r.status === 200 && /html/.test(r.headers["content-type"] ?? "") ? extract(r.body, r.finalUrl) : null;
      await new Promise((res) => setTimeout(res, wallDelay));
    }
    walled = botWalled(pages);
  }
  for (const u of walled) {
    pages.get(u).blocked = true;
    pages.get(u).facts = null;
  }

  // Status of internal link targets that were not crawled (broken / redirecting internal links).
  const targets = new Set();
  for (const p of pages.values()) for (const l of p.facts?.links ?? []) if (l.href && sameSite(l.href, start) && isPageLike(l.href) && !pages.has(l.href)) targets.add(l.href);
  const toCheck = [...targets].slice(0, checkLinks);
  const linkStatus = new Map();
  for (const [u, p] of pages) linkStatus.set(u, { status: p.fetch.status, chain: p.fetch.chain });
  const checked = await pool(
    toCheck,
    concurrency,
    async (u) => {
      const r = await fetchChain(u, { ua, method: "HEAD" });
      // Some servers refuse HEAD; ask again with GET before calling the link broken.
      return [403, 405, 501].includes(r.status) ? fetchChain(u, { ua }) : r;
    },
    { delay },
  );
  checked.forEach((r) => linkStatus.set(r.url, { status: r.status, chain: r.chain }));

  return { start, origin, robots, robotsStatus: robotsRes.status, robotsTxt, notFound, sitemap: sm, pages, linkStatus, uncheckedLinks: targets.size - toCheck.length };
}
