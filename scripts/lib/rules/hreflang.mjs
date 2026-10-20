// hreflang: valid codes, one URL per code, self reference, return links, indexable targets (HTML <link> annotations).
import { canonicalOf, finding, indexable } from "./util.mjs";

export default [
  {
    id: "hreflang-invalid",
    severity: "error",
    tr: "Geçersiz hreflang değeri: dil ISO 639-1 (en, de, pt), isteğe bağlı bölge ISO 3166-1 (en-GB, pt-BR) olmalı ya da x-default. Sık hatalar: en-UK (doğrusu en-GB), jp (ja), cn (zh), eng. Google geçersiz değeri yok sayar",
    en: "Invalid hreflang value: language must be ISO 639-1 (en, de, pt), optionally with an ISO 3166-1 region (en-GB, pt-BR), or x-default. Common mistakes: en-UK (use en-GB), jp (ja), cn (zh), eng. Google ignores invalid values",
    check: ({ pages }) =>
      [...pages].flatMap(([u, p]) => [...new Set((p.facts?.hreflang ?? []).map((h) => h.lang))].map((c) => [c, hreflangProblem(c)]).filter(([, why]) => why).map(([c, why]) => finding(u, `"${c}": ${why}`))),
  },
  {
    id: "hreflang-conflict",
    severity: "warn",
    tr: "Aynı hreflang değeri farklı adreslere gidiyor ya da hreflang hedefinin adresi yok: Google hangisini kullanacağını bilemez",
    en: "One hreflang value points to different URLs, or an hreflang link has no usable href: Google cannot tell which one to use",
    check: ({ pages }) =>
      [...pages].flatMap(([u, p]) => {
        const by = new Map();
        const out = [];
        for (const h of p.facts?.hreflang ?? []) {
          if (!h.href) {
            out.push(finding(u, `"${h.lang}" without href`));
            continue;
          }
          by.set(h.lang, new Set([...(by.get(h.lang) ?? []), h.href]));
        }
        for (const [c, set] of by) if (set.size > 1) out.push(finding(u, `"${c}" → ${[...set].slice(0, 3).join(", ")}`));
        return out;
      }),
  },
  {
    id: "hreflang-self-missing",
    severity: "warn",
    tr: "Sayfada hreflang listesi var ama sayfanın kendisi listede yok: her dil sürümü kendini de içeren tam listeyi vermeli",
    en: "The page has hreflang annotations but does not list itself: every language version must carry the full set, itself included",
    check: ({ pages }) =>
      [...pages].flatMap(([u, p]) => {
        const hl = (p.facts?.hreflang ?? []).filter((h) => h.href);
        if (!hl.length || !indexable(p)) return [];
        const self = canonicalOf(p) ?? p.facts.url;
        return hl.some((h) => h.href === self || h.href === p.facts.url) ? [] : [finding(u, `${hl.length} alternates, none is this URL`)];
      }),
  },
  {
    id: "hreflang-no-return",
    severity: "warn",
    tr: "hreflang dönüş bağlantısı yok: A sayfası B'yi alternatif gösteriyor ama B, A'yı göstermiyor. Google tek yönlü hreflang çiftini yok sayar",
    en: "Missing hreflang return link: page A lists B as an alternate but B does not list A. Google ignores one-way hreflang pairs",
    check: ({ pages }) =>
      [...pages].flatMap(([u, p]) => {
        if (!indexable(p)) return [];
        const self = p.facts.url;
        return (p.facts.hreflang ?? [])
          .filter((h) => h.href && h.href !== self)
          .flatMap((h) => {
            const t = pages.get(h.href);
            if (!t?.facts || t.fetch.status !== 200) return [];
            const back = (t.facts.hreflang ?? []).some((x) => x.href === self || x.href === canonicalOf(p));
            return back ? [] : [finding(u, `${h.lang} → ${h.href} does not link back`)];
          });
      }),
  },
  {
    id: "hreflang-target-bad",
    severity: "warn",
    tr: "hreflang hedefi dizine girebilecek bir sayfa değil (200 dışı durum, yönlendirme, noindex ya da başka adrese canonical): alternatif olarak yalnız kendi canonical'ı olan 200 sayfalar verilmeli",
    en: "hreflang target is not an indexable page (non-200, redirect, noindex or canonical elsewhere): only list self-canonical 200 pages as alternates",
    check: ({ pages, linkStatus }) =>
      [...pages].flatMap(([u, p]) =>
        (p.facts?.hreflang ?? [])
          .filter((h) => h.href && h.href !== p.facts.url)
          .flatMap((h) => {
            const t = pages.get(h.href);
            if (t) return t.fetch.status !== 200 ? [finding(u, `${h.lang} → ${h.href} (status ${t.fetch.status})`)] : !indexable(t) ? [finding(u, `${h.lang} → ${h.href} (noindex or canonical elsewhere)`)] : [];
            const s = linkStatus?.get(h.href);
            return s && s.status !== 200 ? [finding(u, `${h.lang} → ${h.href} (status ${s.status})`)] : [];
          }),
      ),
  },
];

// Region codes people write that are not ISO 3166-1, and languages often confused with a country code.
const BAD_REGION = { uk: "use GB for the United Kingdom", eu: "EU is not a country; list each country or use the language alone", la: "Latin America is not a country; use es-419 or list countries" };
const BAD_LANG = { jp: "use ja (Japanese)", cn: "use zh (Chinese)", kr: "use ko (Korean)", gr: "use el (Greek)", se: "use sv (Swedish)", dk: "use da (Danish)", cz: "use cs (Czech)", ua: "use uk (Ukrainian)", eng: "use the 2-letter code en", ger: "use de", fra: "use fr", spa: "use es", tur: "use tr" };
let languageNames = null;
let regionNames = null;
const knownRegion = (r) => { const n = regionNames.of(r); return !!n && n !== "Unknown Region"; };

/** Why an hreflang value is invalid, or null. Accepts x-default, ll, ll-RR, ll-Ssss, ll-Ssss-RR and ll-419. */
export function hreflangProblem(code) {
  const c = String(code ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (!c) return "empty value";
  if (c === "x-default") return null;
  if (/_/.test(code)) return "use a hyphen, not an underscore";
  const m = c.match(/^([a-z]{2,3})(?:-([a-z]{4}))?(?:-([a-z]{2}|\d{3}))?$/);
  if (!m) return "not in language[-Script][-REGION] form";
  const [, lang, , region] = m;
  if (BAD_LANG[lang]) return BAD_LANG[lang];
  if (lang.length === 3) return "use the 2-letter ISO 639-1 code";
  if (region && BAD_REGION[region]) return BAD_REGION[region];
  try {
    languageNames ??= new Intl.DisplayNames(["en"], { type: "language", fallback: "none" });
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
    if (!languageNames.of(lang)) return `unknown language "${lang}"`;
    if (region && !/^\d{3}$/.test(region) && !knownRegion(region.toUpperCase())) return `unknown region "${region.toUpperCase()}"`;
  } catch {
    /* no ICU data: shape check only */
  }
  return null;
}
