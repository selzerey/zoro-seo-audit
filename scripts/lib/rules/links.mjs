// Internal linking: broken, redirecting, nofollow, empty anchors, weak inbound links.
import { finding, indexable } from "./util.mjs";

const internal = (l, origin) => l.href && new URL(l.href).host.replace(/^www\./, "") === new URL(origin).host.replace(/^www\./, "");

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
        return s && s.status >= 400 ? [finding(t, `status ${s.status}; linked from ${from.length} page(s), e.g. ${from[0]}`)] : [];
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
    id: "weak-inbound",
    severity: "info",
    tr: "Taranan sayfalardan yalnız menü/altbilgi ile bağlanan sayfa (içerikten bağlantı ekle)",
    en: "Only linked from nav/header/footer among crawled pages (add contextual links)",
    check: (ctx) => {
      if (ctx.pages.size < 20) return [];
      const ctxLinks = linkTargets(ctx, (l) => !l.inChrome);
      const anyLinks = linkTargets(ctx, () => true);
      return [...ctx.pages]
        .filter(([u, p]) => indexable(p) && u !== ctx.start && anyLinks.has(u) && !ctxLinks.has(u))
        .map(([u]) => finding(u));
    },
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
