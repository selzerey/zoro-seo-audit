// Indexing and crawl rules: status, redirects, canonical, noindex, sitemap hygiene, robots.txt.
import { isAllowed } from "../robots.mjs";
import { canonicalOf, finding, indexable, noindex, xRobotsNoindex } from "./util.mjs";

export default [
  {
    id: "status-error",
    severity: "error",
    tr: "Sayfa 200 dönmüyor",
    en: "Page does not return 200",
    check: ({ pages }) => [...pages].filter(([, p]) => p.fetch.status !== 200 && !p.blocked).map(([u, p]) => finding(u, `status ${p.fetch.status}`)),
  },
  {
    id: "redirect-chain",
    severity: "warn",
    tr: "Birden fazla yönlendirme adımı",
    en: "Redirect chain longer than one hop",
    check: ({ linkStatus }) => [...linkStatus].filter(([, s]) => s.chain.length > 2).map(([u, s]) => finding(u, s.chain.map((c) => c.status).join(" → "))),
  },
  {
    id: "canonical-missing",
    severity: "warn",
    tr: "Canonical etiketi yok",
    en: "No canonical tag",
    check: ({ pages }) => [...pages].filter(([, p]) => p.facts && !p.facts.canonicals.length && !noindex(p.facts)).map(([u]) => finding(u)),
  },
  {
    id: "canonical-multiple",
    severity: "error",
    tr: "Birden fazla canonical etiketi (Google hepsini yok sayar)",
    en: "Multiple canonical tags (Google ignores all of them)",
    check: ({ pages }) => [...pages].filter(([, p]) => (p.facts?.canonicals.length ?? 0) > 1).map(([u, p]) => finding(u, p.facts.canonicals.join(" | "))),
  },
  {
    id: "canonical-relative",
    severity: "info",
    tr: "Canonical göreli adres (mutlak adres önerilir)",
    en: "Canonical is a relative URL",
    check: ({ pages }) => [...pages].filter(([, p]) => p.facts?.canonicals.length === 1 && !/^https?:\/\//.test(p.facts.canonicals[0])).map(([u, p]) => finding(u, p.facts.canonicals[0])),
  },
  {
    id: "canonical-target-bad",
    severity: "error",
    tr: "Canonical hedefi 200 değil ya da yönlendiriyor",
    en: "Canonical target is not a 200 page",
    check: ({ pages, linkStatus }) =>
      [...pages].flatMap(([u, p]) => {
        const c = canonicalOf(p);
        if (!c || c === p.facts.url) return [];
        const s = linkStatus.get(c) ?? (pages.get(c) && { status: pages.get(c).fetch.status, chain: pages.get(c).fetch.chain });
        if (!s) return [];
        return s.chain.length > 1 || s.status !== 200 ? [finding(u, `${c} → ${s.chain.map((x) => x.status).join(" → ")}`)] : [];
      }),
  },
  {
    id: "canonical-elsewhere",
    severity: "info",
    tr: "Canonical başka bir adresi gösteriyor (bilerek mi?)",
    en: "Canonical points to another URL (intentional?)",
    check: ({ pages }) =>
      [...pages].flatMap(([u, p]) => {
        const c = canonicalOf(p);
        return c && c !== p.facts.url ? [finding(u, c)] : [];
      }),
  },
  {
    id: "sitemap-not-indexable",
    severity: "error",
    tr: "Site haritasındaki adres dizine eklenemez (yönlendirme, hata, noindex ya da başka canonical)",
    en: "Sitemap URL is not indexable",
    check: ({ pages, sitemap }) =>
      [...pages].filter(([u, p]) => sitemap.urls.has(u) && !p.blocked && !(p.fetch.chain.length === 1 && indexable(p))).map(([u, p]) => {
        const why = p.fetch.chain.length > 1 ? `redirect → ${p.fetch.finalUrl}` : p.fetch.status !== 200 ? `status ${p.fetch.status}` : noindex(p.facts ?? {}) || xRobotsNoindex(p.fetch.headers) ? "noindex" : `canonical ${canonicalOf(p)}`;
        return finding(u, why);
      }),
  },
  {
    id: "sitemap-robots-blocked",
    severity: "error",
    tr: "Site haritasındaki adres robots.txt ile engelli",
    en: "Sitemap URL blocked by robots.txt",
    check: ({ sitemap, robots }) => [...sitemap.urls.keys()].filter((u) => !isAllowed(robots, "Googlebot", u)).slice(0, 200).map((u) => finding(u)),
  },
  {
    id: "sitemap-missing",
    severity: "warn",
    tr: "Site haritası bulunamadı ya da okunamadı",
    en: "No readable sitemap",
    check: ({ sitemap, origin }) => (sitemap.urls.size ? [] : [finding(origin, sitemap.problems.map((p) => `${p.sitemap} ${p.status}`).join(", ") || "robots.txt has no Sitemap line")]),
  },
  {
    id: "sitemap-lastmod-future",
    severity: "warn",
    tr: "Site haritasında gelecek tarihli lastmod",
    en: "Sitemap lastmod in the future",
    check: ({ sitemap }) => {
      const now = Date.now() + 36e5 * 24;
      return [...sitemap.urls].filter(([, d]) => d && Date.parse(d) > now).slice(0, 50).map(([u, d]) => finding(u, d));
    },
  },
  {
    id: "noindex-linked",
    severity: "info",
    tr: "noindex sayfa (bilerek mi?)",
    en: "noindex page (intentional?)",
    check: ({ pages }) => [...pages].filter(([, p]) => p.facts && (noindex(p.facts) || xRobotsNoindex(p.fetch.headers))).map(([u]) => finding(u)),
  },
  {
    id: "lang-missing",
    severity: "warn",
    tr: "<html lang> yok",
    en: "<html lang> missing",
    check: ({ pages }) => [...pages].filter(([, p]) => p.facts && !p.facts.lang).map(([u]) => finding(u)),
  },
  {
    id: "mixed-content",
    severity: "error",
    tr: "HTTPS sayfada http:// kaynak yükleniyor",
    en: "HTTPS page loads http:// resources",
    check: ({ pages }) => [...pages].filter(([, p]) => p.facts?.mixedContent.length).map(([u, p]) => finding(u, p.facts.mixedContent.slice(0, 3).join(", "))),
  },
  {
    id: "slow-response",
    severity: "info",
    tr: "Sunucu yanıtı 1 saniyeden yavaş (tek ölçüm; tekrar ölç)",
    en: "Server response slower than 1 s (single sample; re-measure)",
    check: ({ pages }) => [...pages].filter(([, p]) => p.fetch.ms > 1000).map(([u, p]) => finding(u, `${p.fetch.ms} ms`)),
  },
  {
    id: "sitemap-query-url",
    severity: "info",
    tr: "Site haritasında sorgu parametreli adres (?…): çoğu zaman filtre/sıralama kopyasıdır; kendi canonical'ı olan bilinçli bir sayfa mı, kontrol et",
    en: "Query-string URL in the sitemap (?…): often a filter/sort duplicate; confirm it is a deliberate self-canonical page",
    check: ({ sitemap }) => [...sitemap.urls.keys()].filter((u) => new URL(u).search).map((u) => finding(u)),
  },
];
