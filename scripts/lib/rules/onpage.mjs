// Title, description, headings, images. Duplicates only count across indexable pages.
import { finding, indexable, pixelWidth } from "./util.mjs";

function duplicates(pages, pick) {
  const by = new Map();
  for (const [u, p] of pages) {
    if (!indexable(p)) continue;
    const v = pick(p.facts)?.trim().toLocaleLowerCase("tr");
    if (!v) continue;
    by.set(v, [...(by.get(v) ?? []), u]);
  }
  return [...by.values()].filter((us) => us.length > 1).flatMap((us) => us.map((u) => finding(u, `${us.length} pages: ${us.slice(0, 3).join(", ")}`)));
}

const facts = (pages) => [...pages].filter(([, p]) => p.facts);

export default [
  {
    id: "title-missing",
    severity: "error",
    tr: "Başlık (title) yok ya da boş",
    en: "Missing or empty title",
    check: ({ pages }) => facts(pages).filter(([, p]) => !p.facts.title).map(([u]) => finding(u)),
  },
  {
    id: "title-duplicate",
    severity: "warn",
    tr: "Aynı başlık birden fazla sayfada (kanibalizasyon işareti)",
    en: "Same title on several pages (cannibalisation signal)",
    check: ({ pages }) => duplicates(pages, (f) => f.title),
  },
  {
    id: "title-long",
    severity: "info",
    tr: "Başlık arama sonucunda kesilebilir (~580 px üstü)",
    en: "Title may be truncated in results (> ~580 px)",
    check: ({ pages }) => facts(pages).filter(([, p]) => pixelWidth(p.facts.title, 20) > 600).map(([u, p]) => finding(u, `${p.facts.title.length} chars ≈ ${pixelWidth(p.facts.title, 20)} px`)),
  },
  {
    id: "description-missing",
    severity: "warn",
    tr: "Meta açıklama yok",
    en: "Missing meta description",
    check: ({ pages }) => facts(pages).filter(([, p]) => indexable(p) && !p.facts.description?.trim()).map(([u]) => finding(u)),
  },
  {
    id: "description-duplicate",
    severity: "warn",
    tr: "Aynı meta açıklama birden fazla sayfada",
    en: "Same meta description on several pages",
    check: ({ pages }) => duplicates(pages, (f) => f.description),
  },
  {
    id: "description-long",
    severity: "info",
    tr: "Meta açıklama kesilebilir (~920 px üstü); Google zaten çoğu zaman kendi metnini seçer",
    en: "Description may be truncated (> ~920 px); Google often rewrites it anyway",
    check: ({ pages }) => facts(pages).filter(([, p]) => p.facts.description && pixelWidth(p.facts.description, 14) > 990).map(([u, p]) => finding(u, `${p.facts.description.length} chars`)),
  },
  {
    id: "h1-missing",
    severity: "warn",
    tr: "H1 yok",
    en: "No H1",
    check: ({ pages }) => facts(pages).filter(([, p]) => indexable(p) && !p.facts.h1.some(Boolean)).map(([u]) => finding(u)),
  },
  {
    id: "h1-multiple",
    severity: "info",
    tr: "Birden fazla H1 (hata değil; tek ana başlık daha net)",
    en: "Several H1s (not an error)",
    check: ({ pages }) => facts(pages).filter(([, p]) => p.facts.h1.length > 1).map(([u, p]) => finding(u, p.facts.h1.slice(0, 3).join(" | "))),
  },
  {
    id: "img-alt-missing",
    severity: "warn",
    tr: "alt niteliği olmayan görsel (alt=\"\" süs görseli için doğrudur)",
    en: "Image without alt attribute (alt=\"\" is fine for decoration)",
    check: ({ pages }) =>
      facts(pages)
        .map(([u, p]) => [u, p.facts.images.filter((i) => !i.hasAlt)])
        .filter(([, l]) => l.length)
        .map(([u, l]) => finding(u, `${l.length}: ${l.slice(0, 2).map((i) => i.src).join(", ")}`)),
  },
  {
    id: "img-no-dimensions",
    severity: "info",
    tr: "width/height olmayan görsel (yerleşim kayması riski; CSS aspect-ratio varsa sorun yok)",
    en: "Image without width/height (CLS risk unless CSS sets aspect-ratio)",
    check: ({ pages }) =>
      facts(pages)
        .map(([u, p]) => [u, p.facts.images.filter((i) => !i.width || !i.height)])
        .filter(([, l]) => l.length)
        .map(([u, l]) => finding(u, `${l.length} image(s)`)),
  },
  {
    id: "lcp-image-lazy",
    severity: "warn",
    tr: "İlk görünen görsel loading=lazy (açılış hızını düşürür) — ekran görüntüsüyle doğrula",
    en: "First visible image is loading=lazy (hurts LCP) — confirm with a render",
    check: ({ pages }) =>
      facts(pages).flatMap(([u, p]) => {
        const first = p.facts.images.find((i) => i.beforeFirstH2 && !/\.svg(\?|$)/i.test(i.src) && !/^data:/.test(i.src) && Number(i.width ?? 999) >= 300);
        return first && first.loading === "lazy" ? [finding(u, first.src)] : [];
      }),
  },
  {
    id: "og-image-missing",
    severity: "info",
    tr: "og:image yok (paylaşımlarda görsel çıkmaz)",
    en: "No og:image",
    check: ({ pages }) => facts(pages).filter(([, p]) => indexable(p) && !p.facts.ogImage).map(([u]) => finding(u)),
  },
];
