// Site-wide checks: host normalisation, robots.txt, AI crawler access. Uses ctx.probes filled by audit.mjs.
import { BOTS, isAllowed } from "../robots.mjs";
import { finding, noindex, xRobotsNoindex } from "./util.mjs";

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

export default [
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
      if (!f) return [];
      const ok = f.status === 200 && /image|icon|octet-stream/i.test(f.type);
      return ok ? [] : [finding(start, `${f.declared ? "declared" : "not declared, /favicon.ico"}: ${f.url} → ${f.status} ${f.type}`)];
    },
  },
  {
    id: "host-normalisation",
    severity: "error",
    tr: "http:// ya da www/www'siz adres tek adrese 301 ile gitmiyor",
    en: "http:// or www variant does not 301 to one host",
    check: ({ probes, origin }) =>
      (probes?.hosts ?? []).flatMap((h) => {
        if (h.status === 0) return []; // variant does not resolve: nothing to fix
        const end = h.chain.at(-1);
        const ok = new URL(end.url).origin === origin && end.status === 200 && h.chain.slice(0, -1).every((c) => [301, 308].includes(c.status));
        return ok ? [] : [finding(h.url, h.chain.map((c) => `${c.status} ${c.url}`).join(" → "))];
      }),
  },
  {
    id: "robots-missing",
    severity: "warn",
    tr: "robots.txt yok ya da 200 dönmüyor",
    en: "robots.txt missing or not 200",
    check: ({ robotsStatus, origin }) => (robotsStatus === 200 ? [] : [finding(origin + "/robots.txt", `status ${robotsStatus}`)]),
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
];
