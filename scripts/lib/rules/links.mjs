// Internal linking: broken, redirecting, nofollow, empty anchors, contextual inbound links, click depth, link hygiene.
import { UTILITY_PATH } from "../lang.mjs";
import { isPageLike } from "../crawl.mjs";
import { isAllowed } from "../robots.mjs";
import { isLocal } from "./site.mjs";
import { finding, indexable } from "./util.mjs";

const internal = (l, origin) => l.href && new URL(l.href).host.replace(/^www\./, "") === new URL(origin).host.replace(/^www\./, "");

/**
 * Click depth from the start page over follow links of crawled pages (redirects resolved). A depth is exact only
 * while every link target of the shallower layers was crawled; `exactTo` is the deepest layer that holds, so a
 * partial crawl never reports a page as deep just because its shorter path ran through an uncrawled page.
 */
export function clickDepths({ pages, start, origin, robots, linkStatus }) {
  const resolve = (u) => {
    const p = pages.get(u);
    return p && p.fetch.chain.length > 1 ? p.fetch.finalUrl : u;
  };
  const depth = new Map([[start, 0]]);
  let layer = [start];
  let exactTo = Infinity;
  for (let d = 0; layer.length; d++) {
    const next = [];
    for (const u of layer)
      for (const l of pages.get(u)?.facts?.links ?? []) {
        if (l.nofollow || !internal(l, origin) || !isPageLike(l.href) || !isAllowed(robots, "Googlebot", l.href)) continue;
        if (!pages.has(l.href)) {
          const s = linkStatus?.get(l.href);
          if (!s || s.status === 200 || s.chain.length > 1) exactTo = Math.min(exactTo, d + 1);
          continue;
        }
        const t = resolve(l.href);
        if (depth.has(t) || !pages.get(t)?.facts) continue;
        depth.set(t, d + 1);
        next.push(t);
      }
    layer = next;
  }
  return { depth, exactTo };
}

// Legal, contact and help pages: linked from the footer by design, no contextual links expected.
const UTILITY = UTILITY_PATH;
const HUB_TYPES = /^(CollectionPage|SearchResultsPage)$/;
const TRACKING = /(^|[?&;])(utm_[a-z]+|gclid|fbclid|msclkid|yclid|dclid|gbraid|wbraid|mc_cid|mc_eid|_ga|_gl|igshid|jsessionid|phpsessid|sessionid|session_id)=/i;
const LOOPBACK = (h) => /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)$/i.test(h);
const PRIVATE_IP = /^(10\.\d+|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+$/;

/**
 * Why `ref` points at a development or preview address, or null. The audited host itself is never a leak (a local
 * audit of http://localhost:3401/ links to localhost:3401); loopback aliases on the same port count as the same host.
 */
export function devHostReason(ref, start, devHosts = []) {
  if (/^file:/i.test(ref) || /^[a-z]:\\/i.test(ref) || /^\\\\/.test(ref)) return "local file path";
  let u;
  try {
    u = new URL(ref, start);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const s = new URL(start);
  if (u.host === s.host || (LOOPBACK(u.hostname) && LOOPBACK(s.hostname) && u.port === s.port)) return null;
  if (isLocal(u.hostname) || LOOPBACK(u.hostname)) return "localhost";
  if (PRIVATE_IP.test(u.hostname)) return "private IP";
  const site = s.hostname.replace(/^www\./, "");
  if (u.hostname.endsWith(`.${site}`) && /^(staging|stage|preview|dev|uat|local)[.-]/i.test(u.hostname)) return "staging/preview subdomain";
  if (devHosts.some((h) => h && (u.hostname === h || u.hostname.endsWith(`.${h}`) || u.host === h))) return "configured dev host";
  return null;
}

function linkTargets({ pages, origin }, pred) {
  const out = new Map();
  for (const [u, p] of pages)
    for (const l of p.facts?.links ?? []) {
      if (!internal(l, origin) || !pred(l)) continue;
      out.set(l.href, [...(out.get(l.href) ?? []), u]);
    }
  return out;
}

export default [
  {
    id: "internal-link-broken",
    severity: "error",
    tr: "Kırık iç bağlantı (4xx/5xx)",
    en: "Broken internal link (4xx/5xx)",
    check: (ctx) =>
      [...linkTargets(ctx, () => true)].flatMap(([t, from]) => {
        const s = ctx.linkStatus.get(t);
        // 429 = the server asked us to slow down: not evidence of a broken link (see rate-limited).
        return s && s.status >= 400 && s.status !== 429 ? [finding(t, `status ${s.status}; linked from ${from.length} page(s), e.g. ${from[0]}`)] : [];
      }),
  },
  {
    id: "internal-link-redirect",
    severity: "warn",
    tr: "İç bağlantı yönlendirmeye gidiyor (doğrudan son adrese bağla)",
    en: "Internal link points at a redirect (link the final URL)",
    check: (ctx) =>
      [...linkTargets(ctx, () => true)].flatMap(([t, from]) => {
        const s = ctx.linkStatus.get(t);
        return s && s.chain.length > 1 ? [finding(t, `→ ${s.chain.at(-1).url} (${s.chain.map((c) => c.status).join("→")}); from ${from.length} page(s), e.g. ${from[0]}`)] : [];
      }),
  },
  {
    id: "internal-nofollow",
    severity: "info",
    tr: "İç bağlantıda rel=nofollow",
    en: "rel=nofollow on an internal link",
    check: (ctx) => [...linkTargets(ctx, (l) => l.nofollow)].map(([t, from]) => finding(t, `from ${from[0]}`)),
  },
  {
    id: "link-empty-text",
    severity: "warn",
    tr: "Metni ve aria-label'ı olmayan bağlantı",
    en: "Link without text or aria-label",
    check: ({ pages }) =>
      [...pages]
        .map(([u, p]) => [u, (p.facts?.links ?? []).filter((l) => !l.label && l.href)])
        .filter(([, l]) => l.length)
        .map(([u, l]) => finding(u, `${l.length}: ${l.slice(0, 2).map((x) => x.raw).join(", ")}`)),
  },
  {
    id: "inbound-chrome-only",
    severity: "info",
    tr: "Taranan sayfalardan yalnız menü/üst bilgi/alt bilgi/yan sütun bağlantısı alan sayfa; içerik içinden (bağlamsal) hiç bağlantı yok. İlgili yazı ve araçlardan metin içi bağlantı ekle (yasal, iletişim ve liste/hub sayfaları sayılmaz)",
    en: "Only linked from nav/header/footer/aside among crawled pages, no contextual link from content. Add in-text links from related pages (legal, contact and listing/hub pages excluded)",
    check: (ctx) => {
      if (ctx.pages.size < 20) return [];
      const ctxLinks = linkTargets(ctx, (l) => !l.inChrome);
      const anyLinks = linkTargets(ctx, () => true);
      const hub = (p) =>
        (p.facts.links ?? []).filter((l) => !l.inChrome && internal(l, ctx.origin)).length >= 30 ||
        (p.facts.jsonLd ?? []).some((j) => j.ok && [].concat(j.data?.["@graph"] ?? j.data).some((n) => n && [].concat(n["@type"]).some((t) => HUB_TYPES.test(String(t)))));
      // On a partial crawl one or two nav links say nothing (the page's contextual links may sit on uncrawled
      // pages); a page in the menu of 3+ crawled pages that no crawled body links to is a real gap.
      const full = ctx.pages.size >= ctx.sitemap.urls.size * 0.9;
      const from = (u) => new Set((anyLinks.get(u) ?? []).filter((x) => x !== u));
      return [...ctx.pages]
        .filter(([u, p]) => indexable(p) && u !== ctx.start && from(u).size && !(ctxLinks.get(u) ?? []).some((x) => x !== u))
        .filter(([u, p]) => (full || from(u).size >= 3) && !UTILITY.test(new URL(u).pathname) && !hub(p))
        .map(([u]) => finding(u, `${from(u).size} page(s) link it, all from nav/header/footer/aside`));
    },
  },
  {
    id: "click-depth",
    severity: "warn",
    tr: "Ana sayfadan 4 tıklamadan uzak sayfa (yalnız follow bağlantılar): derin sayfalar daha seyrek taranır, daha az değer alır. Hub/kategori sayfalarından kısayol bağlantısı ver. Tarama o derinliğe kadar eksiksizse raporlanır",
    en: "More than 4 clicks from the home page (follow links only): deep pages are crawled less often and get less weight. Link them from hubs/categories. Reported only when the crawl is complete to that depth",
    check: (ctx) => {
      const { depth, exactTo } = clickDepths(ctx);
      return [...depth].filter(([u, d]) => d > 4 && d <= exactTo && indexable(ctx.pages.get(u))).map(([u, d]) => finding(u, `depth ${d}`));
    },
  },
  {
    id: "link-not-crawlable",
    severity: "warn",
    tr: "Taranamayan gezinme: <a> gerçek href olmadan (boş, # ya da javascript:) onclick ile, ya da başka bir öğe onclick ile sayfa değiştiriyor. Google yalnız <a href=\"/adres\"> bağlantılarını izler",
    en: "Uncrawlable navigation: <a> without a real href (empty, # or javascript:) using onclick, or another element changing location on click. Google follows only <a href=\"/url\"> links",
    check: ({ pages }) => [...pages].filter(([, p]) => p.facts?.jsLinks?.length).map(([u, p]) => finding(u, `${p.facts.jsLinks.length}: ${p.facts.jsLinks.slice(0, 2).join(" | ")}`)),
  },
  {
    id: "link-dev-host",
    severity: "error",
    tr: "Sayfa geliştirme/önizleme adresini gösteriyor (localhost, 127.0.0.1, özel IP, staging/preview alt alan adı, file:// ya da C:\\ yolu): bağlantı, görsel, canonical, og ya da JSON-LD içinde. Taranan sitenin kendi adresi sayılmaz",
    en: "Page points at a development/preview address (localhost, 127.0.0.1, private IP, staging/preview subdomain, file:// or C:\\ path) in a link, asset, canonical, og or JSON-LD. The audited host itself is not counted",
    check: ({ pages, start, devHosts, sitemap }) => {
      const out = [...pages].flatMap(([u, p]) => {
        const hits = (p.facts?.refs ?? []).map((r) => [r, devHostReason(r, start, devHosts)]).filter(([, why]) => why);
        return hits.length ? [finding(u, hits.slice(0, 3).map(([r, why]) => `${r} (${why})`).join(", "))] : [];
      });
      // Sitemaps built with a development base URL: child sitemaps and <loc> entries.
      for (const sm of sitemap?.sitemaps ?? []) {
        const why = devHostReason(sm, start, devHosts);
        if (why) out.push(finding(sm, `sitemap file on ${new URL(sm).host} (${why})`));
      }
      const locs = [...(sitemap?.urls?.keys() ?? [])].filter((l) => devHostReason(l, start, devHosts));
      if (locs.length) out.push(finding(locs[0], `${locs.length} sitemap <loc> URL(s) on a development host`));
      return out;
    },
  },
  {
    id: "internal-link-tracking-params",
    severity: "warn",
    tr: "İç bağlantıda takip ya da oturum parametresi (utm_*, gclid, fbclid, sessionid…): her biri ayrı adres sayılır, kopya sayfa ve boşa tarama üretir, analitikte kaynağı bozar",
    en: "Internal link carries tracking or session parameters (utm_*, gclid, fbclid, sessionid…): each is a separate URL, creating duplicates, wasted crawl and broken attribution",
    check: (ctx) =>
      [...ctx.pages].flatMap(([u, p]) => {
        const hits = [...new Set((p.facts?.links ?? []).filter((l) => internal(l, ctx.origin) && TRACKING.test(new URL(l.href).search + new URL(l.href).pathname)).map((l) => l.href))];
        return hits.length ? [finding(u, `${hits.length}: ${hits.slice(0, 2).join(", ")}`)] : [];
      }),
  },
  {
    id: "sitemap-orphan",
    severity: "info",
    tr: "Site haritasında var ama taranan hiçbir sayfadan bağlantı yok (yalnız tarama siteyi kapsıyorsa anlamlı)",
    en: "In the sitemap but no crawled page links to it (meaningful only for a full crawl)",
    check: (ctx) => {
      if (ctx.pages.size < ctx.sitemap.urls.size * 0.9) return [];
      const linked = linkTargets(ctx, () => true);
      return [...ctx.sitemap.urls.keys()].filter((u) => !linked.has(u) && u !== ctx.start).slice(0, 200).map((u) => finding(u));
    },
  },
];
