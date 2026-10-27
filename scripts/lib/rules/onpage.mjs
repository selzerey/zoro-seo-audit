// Title, description, headings, images. Duplicates only count across indexable pages.
import { fold } from "../lang.mjs";
import { finding, indexable, pixelWidth } from "./util.mjs";

function duplicates(pages, pick) {
  const by = new Map();
  for (const [u, p] of pages) {
    if (!indexable(p)) continue;
    const v = fold(pick(p.facts)?.trim());
    if (!v) continue;
    by.set(v, [...(by.get(v) ?? []), u]);
  }
  return [...by.values()].filter((us) => us.length > 1).flatMap((us) => us.map((u) => finding(u, `${us.length} pages: ${us.slice(0, 3).join(", ")}`)));
}

const facts = (pages) => [...pages].filter(([, p]) => p.facts);

// Short words count ("Su" in "Mira Su" is the whole difference); only true function words are dropped.
const STOP = new Set(["ve", "ile", "de", "da", "ne", "mi", "bu", "the", "and", "of", "to", "in", "for", "on", "or"]);
const tokens = (t) => new Set(fold(t).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)));

const TERM_MIN = 4;
/** Word counts of a text (folded, letters/digits only, words of TERM_MIN+ characters). */
function termCounts(text) {
  const m = new Map();
  for (const w of fold(text ?? "").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)) if (w.length >= TERM_MIN) m.set(w, (m.get(w) ?? 0) + 1);
  return m;
}

/**
 * The page's main term (from the title) repeated far more in machine-read fields (JSON-LD, meta, Open Graph, alt
 * text) than in the text people read. Visible copy looks natural while the source is stuffed; passage extraction
 * for AI answers suffers as much as classic ranking. Returns null, or { term, visible, hidden }.
 */
export function hiddenRepetition(facts, { minHidden = 15, ratio = 3 } = {}) {
  const title = termCounts(facts.title);
  if (!title.size) return null;
  const visible = termCounts(facts.text);
  const machine = [
    ...facts.jsonLd.filter((j) => j.ok).map((j) => JSON.stringify(j.data)),
    facts.description,
    facts.ogTitle,
    facts.images.map((i) => i.alt).join(" "),
  ].join(" ");
  const hidden = termCounts(machine);
  let worst = null;
  for (const term of title.keys()) {
    const h = hidden.get(term) ?? 0;
    const v = visible.get(term) ?? 0;
    if (h >= minHidden && h >= ratio * Math.max(v, 1) && (!worst || h > worst.hidden)) worst = { term, visible: v, hidden: h };
  }
  return worst;
}

/**
 * Near-duplicate titles among indexable pages: words shared by many titles (template words such as "anlamı",
 * "nedir") are ignored when both titles have them, then pairs whose remaining words overlap ≥ 80 % (Jaccard) are
 * reported. A template word only one title has is a real difference ("Kız …" vs "Erkek …" are two queries). Catches
 * a category and a listing page chasing the same query ("Kız isimleri" vs "Kız bebek isimleri ve anlamları").
 */
export function nearDuplicateTitles(pages, { threshold = 0.8, templateShare = 0.15 } = {}) {
  const rows = [...pages].filter(([, p]) => indexable(p) && p.facts.title).map(([u, p]) => ({ u, t: p.facts.title, k: tokens(p.facts.title) }));
  const df = new Map();
  for (const r of rows) for (const w of r.k) df.set(w, (df.get(w) ?? 0) + 1);
  const cap = Math.max(3, rows.length * templateShare);
  const template = (w) => df.get(w) > cap;
  const out = [];
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      const a0 = rows[i], b0 = rows[j];
      if (fold(a0.t) === fold(b0.t)) continue;
      const keep = (x, y) => new Set([...x.k].filter((w) => !(template(w) && y.k.has(w))));
      const a = { ...a0, k: keep(a0, b0) }, b = { ...b0, k: keep(b0, a0) };
      if (!a.k.size || !b.k.size) continue;
      const inter = [...a.k].filter((w) => b.k.has(w)).length;
      const jac = inter / (a.k.size + b.k.size - inter);
      if (jac >= threshold) out.push(finding(a.u, `≈ ${b.u} (${Math.round(jac * 100)}%): "${a.t}" / "${b.t}"`));
    }
  return out;
}

/** Brand of the site: WebSite/Organization name in JSON-LD or og:site_name, from the first page that has one. */
export function siteBrand(pages) {
  for (const [, p] of pages) {
    const f = p.facts;
    if (!f) continue;
    for (const j of f.jsonLd ?? []) {
      if (!j.ok) continue;
      const g = [].concat(j.data?.["@graph"] ?? j.data);
      const w = g.find((n) => n && /^(WebSite|Organization)$/.test(String(n["@type"])) && n.name);
      if (w) return String(w.name);
    }
    if (f.siteName) return f.siteName;
  }
  return null;
}

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
    id: "title-near-duplicate",
    severity: "warn",
    tr: "Birbirine çok benzeyen başlıklar (şablon kelimeleri dışında %80+ ortak): aynı aramayı hedefleyen iki sayfa olabilir",
    en: "Near-duplicate titles (80%+ shared words beyond template words): two pages may chase the same query",
    check: ({ pages }) => nearDuplicateTitles(pages),
  },
  {
    id: "title-no-brand",
    severity: "info",
    tr: "Kısa başlıkta marka yok (\"İletişim\", \"Arama\" gibi): sonuçta kimin sayfası olduğu anlaşılmaz",
    en: "Short title without the brand (\"Contact\", \"Search\"): the result does not say whose page it is",
    check: ({ pages }) => {
      const brand = siteBrand(pages);
      if (!brand) return [];
      const b = fold(brand);
      return facts(pages)
        .filter(([, p]) => indexable(p) && p.facts.title && p.facts.title.length < 30 && !fold(p.facts.title).includes(b))
        .map(([u, p]) => finding(u, p.facts.title));
    },
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
  {
    id: "twitter-card-missing",
    severity: "info",
    tr: "og:image var ama twitter:card yok (X'te paylaşımlar büyük görselli kart olarak çıkmaz; summary_large_image önerilir)",
    en: "og:image present but no twitter:card (X shows no large-image card; summary_large_image recommended)",
    check: ({ pages }) => facts(pages).filter(([, p]) => indexable(p) && p.facts.ogImage && !p.facts.twitterCard).map(([u]) => finding(u)),
  },
  {
    id: "hidden-keyword-repetition",
    severity: "info",
    tr: "Başlıktaki ana terim, kullanıcının gördüğü metinden çok makinenin okuduğu alanlarda (JSON-LD, meta, OG, alt) tekrarlanıyor: aşırı optimizasyon işareti; pasaj çıkarımını da zorlaştırır. Yapısal verideki tekrarları azalt",
    en: "The title's main term is repeated far more in machine-read fields (JSON-LD, meta, OG, alt) than in the text people see: an over-optimisation sign that also hurts passage extraction. Trim the repeats in structured data",
    check: ({ pages }) =>
      facts(pages).flatMap(([u, p]) => {
        if (!indexable(p)) return [];
        const r = hiddenRepetition(p.facts);
        return r ? [finding(u, `"${r.term}": ${r.visible}× visible, ${r.hidden}× in JSON-LD/meta/alt`)] : [];
      }),
  },
];
