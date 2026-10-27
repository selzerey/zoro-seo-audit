// Site-wide checks: host normalisation, robots.txt (reachability, syntax, assets, Content-Signal), soft-404 probe, AI crawler access. Uses ctx.probes filled by audit.mjs.
import { anyPhrase, fold } from "../lang.mjs";
import { BOTS, contentSignals, isAllowed, robotsSyntax } from "../robots.mjs";
import { finding, indexable, noindex, xRobotsNoindex } from "./util.mjs";

/**
 * Site closed to search engines on purpose (staging / pre-launch): robots.txt blocks Googlebot at the start URL and
 * most crawled pages say noindex. Then per-page noindex / sitemap / robots findings are the switch, not bugs.
 */
export function siteClosed({ robots, start, pages }) {
  if (isAllowed(robots, "Googlebot", start)) return false;
  const withFacts = [...pages.values()].filter((p) => p.facts);
  if (!withFacts.length) return true;
  const ni = withFacts.filter((p) => noindex(p.facts) || xRobotsNoindex(p.fetch.headers)).length;
  return ni / withFacts.length >= 0.8;
}

/** Format problems of an llms.txt body (llmstxt.org): "# Title" first, a "> summary" line, a list of links. */
export function llmsFormat(body) {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  if (!/^# \S/.test(lines[0] ?? "")) out.push("first line is not '# Title'");
  if (!lines.some((l) => /^> \S/.test(l))) out.push("no '> summary' line");
  if (!lines.some((l) => /^[-*] \[[^\]]+\]\([^)\s]+\)/.test(l))) out.push("no '- [name](url)' link list");
  return out;
}

// Title or H1 of an error page served with 200 (Turkish + English wording).
const NOT_FOUND_RE = anyPhrase("notFound");
const NOT_FOUND = { test: (s) => /(^|\D)404(\D|$)/.test(s) || NOT_FOUND_RE.test(fold(s)) };

/** Same-host assets robots.txt hides from Googlebot, grouped by folder ("/_next/static/chunks/" → 40 files). */
export function blockedAssets({ pages, robots }) {
  const dirs = new Map();
  for (const [u, p] of pages)
    for (const r of p.facts?.resources ?? []) {
      if (isAllowed(robots, "Googlebot", r)) continue;
      const dir = new URL(r).pathname.replace(/[^/]*$/, "");
      const d = dirs.get(dir) ?? { files: new Set(), page: u };
      d.files.add(r);
      dirs.set(dir, d);
    }
  return [...dirs].map(([dir, d]) => ({ dir, count: d.files.size, example: [...d.files][0], page: d.page }));
}

export const isLocal = (host) => /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)$|\.localhost$/i.test(host);

const unreachable = (s) => s === 0 || s === 429 || s >= 500;

export default [
  {
    id: "rate-limited",
    severity: "info",
    tr: "Sunucu bazı isteklere 429 (çok fazla istek) dedi, tekrar denemeye rağmen: bu adresler değerlendirilmedi, kırık sayılmadı. Daha yavaş tekrar çalıştır (--concurrency 1 --delay 1000) ya da kendi IP'ne izin ver",
    en: "The server answered 429 Too Many Requests to some requests, even after retrying: those URLs were not judged and are not counted as broken. Re-run slower (--concurrency 1 --delay 1000) or allow your IP",
    site: true,
    check: ({ pages, linkStatus, probes, start }) => {
      const urls = new Set([...pages].filter(([, p]) => p.fetch.status === 429).map(([u]) => u));
      for (const [u, s] of linkStatus ?? []) if (s.status === 429) urls.add(u);
      for (const h of [...(probes?.hosts ?? []), probes?.favicon].filter(Boolean)) if (h.status === 429) urls.add(h.url);
      return urls.size ? [finding(start, `${urls.size} URL(s), e.g. ${[...urls].slice(0, 3).join(", ")}`)] : [];
    },
  },
  {
    id: "site-closed",
    severity: "error",
    tr: "Site arama motorlarına kapalı (robots.txt her şeyi engelliyor ve sayfalar noindex). Hazırlık sitesiyse beklenen durum; canlıysa en önemli sorun budur. Bu durumda sayfa başına noindex/site haritası/robots bulguları gizlenir",
    en: "Site closed to search engines (robots.txt blocks all and pages are noindex). Expected on staging; the top issue if live. Per-page noindex/sitemap/robots findings are suppressed",
    site: true,
    check: (ctx) => (siteClosed(ctx) ? [finding(ctx.start, "robots.txt Disallow: / + noindex")] : []),
  },
  {
    id: "favicon-missing",
    severity: "warn",
    tr: "Site ikonu (favicon) yok ya da açılmıyor; Google arama sonucunda sitenin yanında bu ikonu gösterir",
    en: "No working favicon; Google shows it next to the site in results",
    check: ({ probes, start }) => {
      const f = probes?.favicon;
      if (!f || f.status === 429) return [];
      const ok = f.status === 200 && /image|icon|octet-stream/i.test(f.type);
      const how = f.declared ? "declared" : f.inline ? "only an inline data: icon is declared (Google needs a file URL), /favicon.ico" : "not declared, /favicon.ico";
      return ok ? [] : [finding(start, `${how}: ${f.url} → ${f.status} ${f.type}`)];
    },
  },
  {
    id: "favicon-blocked",
    severity: "warn",
    tr: "Site ikonu (favicon) ya da ona giden yönlendirme robots.txt ile Googlebot/Googlebot-Image'a kapalı: Google ikonu alamaz, arama sonucunda varsayılan simge çıkar. Google'ın ikon dokümanı ana sayfadan ikon konumuna yönlendirmelerin de takip edilebilir olmasını ister",
    en: "The favicon, or a redirect on the way to it, is disallowed for Googlebot/Googlebot-Image in robots.txt: Google cannot fetch the icon and shows a default one. Google's favicon guidance requires that redirects from the home page to the icon location can be followed",
    site: true,
    check: ({ probes, robots, origin, start }) => {
      const f = probes?.favicon;
      if (!f || !robots || f.status !== 200) return [];
      const hops = (f.chain ?? [{ url: f.url }]).map((h) => h.url).filter((u) => u.startsWith(origin));
      const blocked = hops.filter((u) => !isAllowed(robots, "Googlebot-Image", u) || !isAllowed(robots, "Googlebot", u));
      return blocked.length ? [finding(start, `${blocked.join(" → ")} (robots.txt Disallow applies to Googlebot-Image/Googlebot${hops.length > 1 ? "; icon is reached through a redirect" : ""})`)] : [];
    },
  },
  {
    id: "host-normalisation",
    severity: "error",
    tr: "http:// ya da www/www'siz adres tek adrese 301 ile gitmiyor",
    en: "http:// or www variant does not 301 to one host",
    check: ({ probes, origin }) =>
      // A local / IP host has no www variant to normalise (local or staging audit).
      isLocal(new URL(origin).hostname) || /^\d{1,3}(\.\d{1,3}){3}$/.test(new URL(origin).hostname) ? [] : (probes?.hosts ?? []).flatMap((h) => {
        if (h.status === 0) return []; // variant does not resolve: nothing to fix
        const end = h.chain.at(-1);
        // The last hop answered 429 (slow down): judge only the redirects and where they lead.
        const ok = new URL(end.url).origin === origin && (end.status === 200 || end.status === 429) && h.chain.slice(0, -1).every((c) => [301, 308].includes(c.status));
        if (end.status === 429 && h.chain.length === 1) return [];
        return ok ? [] : [finding(h.url, h.chain.map((c) => `${c.status} ${c.url}`).join(" → "))];
      }),
  },
  {
    id: "robots-missing",
    severity: "warn",
    tr: "robots.txt yok (4xx): Google her şeyi serbest sayar; Sitemap satırı için bir dosya koy",
    en: "robots.txt missing (4xx): Google treats everything as allowed; add one for the Sitemap line",
    check: ({ robotsStatus, origin }) => (robotsStatus === 200 || unreachable(robotsStatus) ? [] : [finding(origin + "/robots.txt", `status ${robotsStatus}`)]),
  },
  {
    id: "robots-unreachable",
    severity: "error",
    tr: "robots.txt 5xx/429 dönüyor ya da yanıt vermiyor: Google bu durumda siteyi geçici olarak tamamen yasak sayar ve taramayı durdurur (tarayıcıda site normal görünür)",
    en: "robots.txt returns 5xx/429 or does not answer: Google then treats the whole site as disallowed and stops crawling (the site looks fine in a browser)",
    site: true,
    check: ({ robotsStatus, origin }) => (unreachable(robotsStatus) ? [finding(origin + "/robots.txt", robotsStatus ? `status ${robotsStatus}` : "no response")] : []),
  },
  {
    id: "robots-syntax",
    severity: "warn",
    tr: "robots.txt'te ayrıştırılamayan satır, bilinmeyen yönerge (robots.txt'te noindex desteklenmez), User-agent'tan önce kural, göreli Sitemap ya da HTML yanıt: o satırlar yok sayılır",
    en: "robots.txt has unparsable lines, unknown directives (noindex is not supported there), rules before any User-agent, a relative Sitemap or an HTML body: those lines are ignored",
    site: true,
    check: ({ robotsTxt, origin }) => {
      if (robotsTxt?.status !== 200) return [];
      const p = robotsSyntax(robotsTxt.body, robotsTxt);
      return p.length ? [finding(origin + "/robots.txt", `${p.slice(0, 5).join("; ")}${p.length > 5 ? ` (+${p.length - 5})` : ""}`)] : [];
    },
  },
  {
    id: "content-signal-conflict",
    severity: "warn",
    tr: "robots.txt Content-Signal satırı ya da Cloudflare'in yönettiği blok, botlara verilen izinle çelişiyor (ör. alıntı botları açık ama ai-input=no). Cloudflare robots.txt'yi kenar sunucuda değiştirir: depodaki dosya ile canlıdaki farklı olabilir",
    en: "robots.txt Content-Signal or a Cloudflare-managed block contradicts the bot rules (e.g. citation bots allowed but ai-input=no). Cloudflare rewrites robots.txt at the edge: the repo file and the live one may differ",
    site: true,
    check: ({ robotsTxt, robots, start, origin }) => {
      if (robotsTxt?.status !== 200) return [];
      const { signals, managed } = contentSignals(robotsTxt.body);
      const cite = BOTS.filter((b) => b.kind === "ai-search" || b.kind === "ai-user");
      const open = cite.filter((b) => isAllowed(robots, b.ua, start)).map((b) => b.ua);
      const shut = cite.filter((b) => !isAllowed(robots, b.ua, start)).map((b) => b.ua);
      const out = [];
      if (signals["ai-input"] === "no" && open.length) out.push(`ai-input=no while ${open.join(", ")} may crawl`);
      if (signals.search === "no" && BOTS.some((b) => b.kind === "search" && isAllowed(robots, b.ua, start))) out.push("search=no while search bots may crawl");
      if (managed && shut.length) out.push(`Cloudflare-managed block blocks ${shut.join(", ")}`);
      return out.length ? [finding(origin + "/robots.txt", out.join("; "))] : [];
    },
  },
  {
    id: "robots-blocks-assets",
    severity: "error",
    tr: "robots.txt sayfaların yüklediği CSS/JS/görsel dosyalarını Googlebot'a kapatıyor: Google sayfayı eksik çizer (mobil uyum, içerik, görseller). Next.js'te tipik hata Disallow: /_next/",
    en: "robots.txt blocks CSS/JS/image files the pages load: Google renders the page incomplete (mobile, content, images). Typical in Next.js: Disallow: /_next/",
    site: true,
    check: (ctx) => blockedAssets(ctx).map((b) => finding(b.example, `${b.count} file(s) under ${b.dir}; used by ${b.page}`)),
  },
  {
    id: "soft-404",
    severity: "error",
    tr: "Soft 404: var olmayan bir adres 404/410 yerine 200 dönüyor (ya da ana sayfaya yönleniyor) veya 200 dönen bir sayfa \"bulunamadı\" diyor. Google bunları soft 404 sayar; silinen adresler dizinden düzgün çıkmaz",
    en: "Soft 404: a made-up URL returns 200 (or redirects to the home page) instead of 404/410, or a 200 page says \"not found\". Google flags these; removed URLs do not leave the index cleanly",
    check: ({ notFound, pages }) => {
      const out = [];
      if (notFound?.status === 200) {
        const via = notFound.chain.length > 1 ? `redirects to ${notFound.finalUrl}, ` : "";
        out.push(finding(notFound.url, `made-up URL: ${via}status 200${notFound.noindex ? " (noindex)" : ""}, title "${notFound.title ?? ""}"`));
      }
      for (const [u, p] of pages) {
        if (!indexable(p) || p.fetch.chain.length > 1 || p.facts.wordCount >= 150) continue;
        const said = [p.facts.title, ...(p.facts.h1 ?? [])].find((t) => NOT_FOUND.test(t ?? ""));
        if (said) out.push(finding(u, `200 page titled "${said}" (${p.facts.wordCount} words)`));
      }
      return out;
    },
  },
  {
    id: "robots-no-sitemap",
    severity: "info",
    tr: "robots.txt'te Sitemap satırı yok",
    en: "No Sitemap line in robots.txt",
    check: ({ robots, robotsStatus, origin }) => (robotsStatus === 200 && !robots.sitemaps.length ? [finding(origin + "/robots.txt")] : []),
  },
  {
    id: "search-bot-blocked",
    severity: "error",
    tr: "Arama motoru botu ana sayfayı tarayamıyor",
    en: "A search engine bot cannot crawl the home page",
    check: ({ robots, start }) => BOTS.filter((b) => b.kind === "search" && !isAllowed(robots, b.ua, start)).map((b) => finding(start, b.ua)),
  },
  {
    id: "ai-bot-access",
    severity: "info",
    tr: "Yapay zekâ botları: arama/kullanıcı botları açık olmalı (alıntılanmak için); eğitim botları tercih meselesi",
    en: "AI bots: search/user bots should be allowed (to be cited); training bots are a choice",
    site: true,
    check: ({ robots, start }) => {
      const rows = BOTS.filter((b) => b.kind !== "search").map((b) => `${b.ua}(${b.kind}): ${isAllowed(robots, b.ua, start) ? "allow" : "BLOCK"}`);
      const blockedCitation = BOTS.filter((b) => (b.kind === "ai-search" || b.kind === "ai-user") && !isAllowed(robots, b.ua, start));
      return [finding(start, (blockedCitation.length ? "CITATION BOTS BLOCKED — " : "") + rows.join("; "))];
    },
  },
  {
    id: "bot-wall",
    severity: "warn",
    tr: "Bot doğrulama ekranı döndü (WAF/Cloudflare ya da sitenin kendi koruması); bu sayfalar denetlenmedi. --concurrency 1 --delay 1500 ile ya da izinli IP'den tekrar dene. Googlebot'un bu ekranı görmediğini GSC URL denetimiyle doğrula",
    en: "Bot challenge returned (WAF or the site's own protection); these pages were not audited. Retry slower or from an allowlisted IP; confirm with GSC URL inspection that Googlebot is not challenged",
    check: ({ pages }) => [...pages].filter(([, p]) => p.blocked).map(([u, p]) => finding(u, `status ${p.fetch.status}`)),
  },
  {
    id: "llms-txt",
    severity: "info",
    tr: "llms.txt isteğe bağlı bir dosya (Google kullanmaz; bazı yapay zekâ araçları okur). Yoksa sorun değil; varsa biçimi (# başlık, > özet, bağlantı listesi) ve bağlantıları doğru olsun",
    en: "llms.txt is optional (Google ignores it; some AI tools read it). Missing is fine; if present, keep the format (# title, > summary, link list) and links working",
    site: true,
    check: ({ probes }) => {
      const l = probes?.llms;
      if (!l) return [];
      if ([404, 410].includes(l.status) || (l.status === 200 && /html/i.test(l.type))) return [finding(l.url, l.status === 200 ? "not present (200 with an HTML page)" : "not present (optional)")];
      if (l.status !== 200) return [finding(l.url, `status ${l.status}`)];
      const bad = (l.links ?? []).filter((x) => x.status !== 200 || x.hops > 1).map((x) => `${x.url} → ${x.status}${x.hops > 1 ? " (redirect)" : ""}`);
      const problems = [...llmsFormat(l.body ?? ""), ...(bad.length ? [`${bad.length} link(s) not 200: ${bad.slice(0, 3).join(", ")}`] : [])];
      return problems.length ? [finding(l.url, problems.join("; "))] : [];
    },
  },
  {
    id: "https-hsts",
    severity: "warn",
    tr: "HTTPS sitede Strict-Transport-Security (HSTS) başlığı yok: tarayıcı ilk girişte http'ye düşebilir. Güvenlik ayarıdır, sıralama etkisi yok; max-age en az 6 ay olsun",
    en: "HTTPS site sends no Strict-Transport-Security (HSTS) header: browsers may still try http first. Security hardening, no ranking effect; use max-age of at least 6 months",
    site: true,
    check: ({ pages, start }) => {
      const u = new URL(start);
      if (u.protocol !== "https:" || isLocal(u.hostname)) return [];
      const h = pages.get(start)?.fetch.headers;
      if (!h) return [];
      const v = h["strict-transport-security"];
      const age = Number(/max-age=(\d+)/i.exec(v ?? "")?.[1] ?? 0);
      return !v || age === 0 ? [finding(start, v ? `max-age=0` : "header missing")] : [];
    },
  },
  {
    id: "feed-missing",
    severity: "info",
    tr: "Blog/rehber yazıları (Article/BlogPosting) var ama RSS/Atom akışı bildirilmemiş (<link rel=\"alternate\" type=\"application/rss+xml\">). Akış okuyucular, bazı haber ve yapay zekâ toplayıcıları yeni yazıları buradan bulur",
    en: "Article/BlogPosting pages exist but no RSS/Atom feed is declared (<link rel=\"alternate\" type=\"application/rss+xml\">). Feed readers and some news/AI aggregators find new posts there",
    site: true,
    check: ({ pages }) => {
      const ARTICLE = /^(Article|BlogPosting|NewsArticle)$/;
      const posts = [...pages].filter(([, p]) => (p.facts?.jsonLd ?? []).some((j) => j.ok && [].concat(j.data?.["@graph"] ?? j.data).some((n) => n && [].concat(n["@type"]).some((t) => ARTICLE.test(String(t))))));
      if (posts.length < 3 || [...pages].some(([, p]) => p.facts?.feeds?.length)) return [];
      return [finding(posts[0][0], `${posts.length} article page(s), no feed link`)];
    },
  },
];

