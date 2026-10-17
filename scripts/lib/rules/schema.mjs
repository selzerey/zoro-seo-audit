// JSON-LD: parse errors, missing key fields, @id consistency, dates. Only checks with search impact or real breakage.
import { ARTICLE_TYPES, ENTITY_TYPES, NOT_ARTICLE_TYPES, REQUIREMENTS } from "../data/schema-requirements.mjs";
import { finding, indexable, uniformDay } from "./util.mjs";

/** Every typed node in a JSON-LD document (handles @graph and nesting). `nested`: inside another typed node. */
export function nodes(data, { withNesting = false } = {}) {
  const out = [];
  const walk = (v, nested) => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x, nested));
    if (!v || typeof v !== "object") return;
    if (v["@type"]) out.push(withNesting ? { node: v, nested } : v);
    for (const [k, x] of Object.entries(v)) if (k !== "@context") walk(x, nested || (!!v["@type"] && k !== "@graph"));
  };
  walk(data, false);
  return out;
}

/** Top-level typed nodes only (the page's own entities, not list items or publishers inside them). */
const topLevel = (pages) =>
  [...pages].flatMap(([u, p]) => (p.facts?.jsonLd ?? []).filter((j) => j.ok).flatMap((j) => nodes(j.data, { withNesting: true }).filter((x) => !x.nested).map((x) => [u, x.node])));

const types = (n) => [].concat(n["@type"]).map(String);
const has = (n, t) => types(n).includes(t);
const all = (pages) => [...pages].flatMap(([u, p]) => (p.facts?.jsonLd ?? []).filter((j) => j.ok).flatMap((j) => nodes(j.data).map((n) => [u, n])));

const ARTICLE = ["Article", "NewsArticle", "BlogPosting"];
// Types whose dateModified means "data changed", not "page changed" (do not compare with sitemap lastmod).
const DATA_TYPES = ["Dataset", "DataCatalog", "Event", "Offer"];

const filled = (v) => v != null && v !== "" && !(Array.isArray(v) && !v.length);
/** Properties (or `a|b` alternatives) a node lacks. */
const lacking = (n, props) => props.filter((k) => !k.split("|").some((x) => filled(n[x])));

/**
 * Missing required (`which` = "required") or recommended properties. Site entities (Organization, Person, WebSite…)
 * are merged per @id / name over the whole crawl first: a short reference copy on one page is fine when the full node
 * lives on another. Page entities (Product, Event…) are judged per page, top-level nodes only.
 */
export function missingProps(pages, which) {
  const entityOrder = ["LocalBusiness", ...ENTITY_TYPES.filter((t) => t !== "LocalBusiness")];
  const ents = new Map();
  for (const [u, n] of all(pages)) {
    const t = entityOrder.find((x) => has(n, x));
    if (!t) continue;
    const key = n["@id"] ?? (n.name ? `${t}: ${n.name}` : null);
    if (!key) continue;
    const e = ents.get(key) ?? { t, u, node: {} };
    for (const [k, v] of Object.entries(n)) if (filled(v) && !filled(e.node[k])) e.node[k] = v;
    ents.set(key, e);
  }
  const out = [...ents].flatMap(([key, e]) => {
    const miss = lacking(e.node, REQUIREMENTS[e.t][which]);
    return miss.length ? [finding(e.u, `${e.t} ${key}: ${miss.join(", ")}`)] : [];
  });
  for (const [u, n] of topLevel(pages)) {
    const t = types(n).find((x) => REQUIREMENTS[x] && !ENTITY_TYPES.includes(x));
    if (!t) continue;
    const miss = lacking(n, REQUIREMENTS[t][which]);
    if (miss.length) out.push(finding(u, `${t}: ${miss.join(", ")}`));
  }
  return out;
}

/** Long indexable pages with no Article-type and no "not an article" type (tool, term, listing, product…). */
export function articleCandidates(pages, start, minWords = 800) {
  return [...pages]
    .filter(([u, p]) => u !== start && indexable(p) && p.facts.wordCount >= minWords)
    .filter(([, p]) => {
      const ts = (p.facts.jsonLd ?? []).filter((j) => j.ok).flatMap((j) => nodes(j.data).flatMap(types));
      return !ts.some((t) => ARTICLE_TYPES.includes(t) || NOT_ARTICLE_TYPES.includes(t));
    })
    .map(([u, p]) => finding(u, `${p.facts.wordCount} words, no Article/BlogPosting`));
}

export default [
  {
    id: "jsonld-invalid",
    severity: "error",
    tr: "JSON-LD bozuk (ayrıştırılamıyor)",
    en: "JSON-LD does not parse",
    check: ({ pages }) => [...pages].flatMap(([u, p]) => (p.facts?.jsonLd ?? []).filter((j) => !j.ok).map((j) => finding(u, j.error))),
  },
  {
    id: "article-fields",
    severity: "warn",
    tr: "Article/BlogPosting'te headline, datePublished, author ya da image eksik",
    en: "Article/BlogPosting missing headline, datePublished, author or image",
    check: ({ pages }) =>
      topLevel(pages)
        .filter(([, n]) => ARTICLE.some((t) => has(n, t)))
        .flatMap(([u, n]) => {
          const miss = ["headline", "datePublished", "author", "image"].filter((k) => !n[k]);
          return miss.length ? [finding(u, `${types(n).join("/")}: ${miss.join(", ")}`)] : [];
        }),
  },
  {
    id: "author-fake-risk",
    severity: "info",
    tr: "Person yazar var: gerçek ve doğrulanabilir kişi mi? (uydurma uzman profili spam sayılır)",
    en: "Person author present: is it a real, verifiable person? (invented experts are spam)",
    check: ({ pages }) => {
      const names = new Map();
      for (const [u, n] of all(pages)) {
        if (!ARTICLE.some((t) => has(n, t))) continue;
        for (const a of [].concat(n.author ?? [])) if (a && typeof a === "object" && has(a, "Person") && a.name) names.set(a.name, u);
      }
      return [...names].map(([name, u]) => finding(u, name));
    },
  },
  {
    id: "date-future",
    severity: "warn",
    tr: "datePublished/dateModified gelecekte",
    en: "datePublished/dateModified in the future",
    check: ({ pages }) => {
      const now = Date.now() + 864e5;
      return all(pages).flatMap(([u, n]) => ["datePublished", "dateModified"].filter((k) => n[k] && Date.parse(n[k]) > now).map((k) => finding(u, `${types(n)[0]}.${k}=${n[k]}`)));
    },
  },
  {
    id: "date-order",
    severity: "warn",
    tr: "dateModified, datePublished'tan önce",
    en: "dateModified earlier than datePublished",
    check: ({ pages }) => all(pages).filter(([, n]) => n.datePublished && n.dateModified && Date.parse(n.dateModified) < Date.parse(n.datePublished)).map(([u, n]) => finding(u, `${n.datePublished} > ${n.dateModified}`)),
  },
  {
    id: "sitemap-lastmod-drift",
    severity: "info",
    tr: "Site haritası lastmod ile sayfa dateModified farklı gün (Dataset/Event tarihleri hariç)",
    en: "Sitemap lastmod and page dateModified differ (Dataset/Event dates excluded)",
    check: ({ pages, sitemap }) =>
      all(pages).flatMap(([u, n]) => {
        if (!n.dateModified || DATA_TYPES.some((t) => has(n, t)) || !ARTICLE.concat("WebPage").some((t) => has(n, t))) return [];
        const lm = sitemap.urls.get(u);
        if (!lm) return [];
        return lm.slice(0, 10) !== String(n.dateModified).slice(0, 10) ? [finding(u, `lastmod ${lm.slice(0, 10)} vs ${types(n)[0]} ${String(n.dateModified).slice(0, 10)}`)] : [];
      }),
  },
  {
    id: "datemodified-uniform",
    severity: "info",
    tr: "Sayfaların %90'ı ya da fazlasında JSON-LD dateModified aynı gün: tarih derleme/istek anında basılıyor olabilir. Her deploy'da değişen dateModified güven kaybettirir; yalnız içerik değişince güncelle (Dataset/Event tarihleri hariç)",
    en: "90%+ of pages share one JSON-LD dateModified day: likely stamped at build/request time. A dateModified that changes on every deploy loses trust; change it only with the content (Dataset/Event dates excluded)",
    site: true,
    check: ({ pages, start }) => {
      const dates = [];
      for (const [u, p] of pages) {
        if (!indexable(p)) continue;
        const own = topLevel(new Map([[u, p]])).map(([, n]) => n).find((n) => n.dateModified && !DATA_TYPES.some((t) => has(n, t)) && types(n).some((t) => ARTICLE.includes(t) || /WebPage$|Page$/.test(t)));
        if (own) dates.push(String(own.dateModified).slice(0, 10));
      }
      const d = uniformDay(dates, { min: 10 });
      return d ? [finding(start, `${d.n}/${d.of} pages dateModified = ${d.day}`)] : [];
    },
  },
  {
    id: "org-id-inconsistent",
    severity: "warn",
    tr: "Aynı kuruluş farklı @id'lerle (varlık birleşmez)",
    en: "Same organisation under different @ids",
    check: ({ pages }) => {
      const ids = new Map();
      for (const [u, n] of all(pages)) {
        if (!has(n, "Organization") || !n.name) continue;
        const s = ids.get(n.name) ?? new Map();
        s.set(n["@id"] ?? "(none)", u);
        ids.set(n.name, s);
      }
      return [...ids].filter(([, s]) => s.size > 1).map(([name, s]) => finding([...s.values()][0], `${name}: ${[...s.keys()].join(" | ")}`));
    },
  },
  {
    id: "breadcrumb-positions",
    severity: "warn",
    tr: "BreadcrumbList position sırası bozuk ya da item eksik",
    en: "BreadcrumbList positions out of order or item missing",
    check: ({ pages }) =>
      all(pages)
        .filter(([, n]) => has(n, "BreadcrumbList"))
        .flatMap(([u, n]) => {
          const items = [].concat(n.itemListElement ?? []);
          const bad = items.some((it, i) => Number(it.position) !== i + 1 || (!it.item && i < items.length - 1));
          return bad ? [finding(u)] : [];
        }),
  },
  {
    id: "faq-howto-note",
    severity: "info",
    tr: "FAQPage/HowTo var: Google bu zengin sonuçları çoğu site için göstermiyor; zararı yok, sıralama getirmez",
    en: "FAQPage/HowTo present: Google shows these rich results for few sites; harmless, no ranking gain",
    site: true,
    check: ({ pages }) => {
      const hit = all(pages).find(([, n]) => has(n, "FAQPage") || has(n, "HowTo"));
      return hit ? [finding(hit[0], "site-wide note")] : [];
    },
  },
  {
    id: "page-entity-missing",
    severity: "info",
    tr: "Sayfanın kendi yapısal verisi yok (yalnız BreadcrumbList / site geneli Organization-WebSite): WebPage türü + ana varlık (Article, Product, DefinedTerm, WebApplication, Dataset…) ekle",
    en: "No page-level structured data (only BreadcrumbList / site-wide Organization-WebSite): add a WebPage type + main entity",
    check: ({ pages }) => {
      const SITE_ONLY = new Set(["BreadcrumbList", "Organization", "WebSite", "ListItem", "ImageObject", "ContactPoint"]);
      return [...pages]
        .filter(([, p]) => indexable(p))
        .filter(([, p]) => {
          const ts = (p.facts.jsonLd ?? []).filter((j) => j.ok).flatMap((j) => nodes(j.data).flatMap(types));
          return !ts.some((t) => !SITE_ONLY.has(t));
        })
        .map(([u]) => finding(u));
    },
  },
  {
    id: "schema-dangling-id",
    severity: "info",
    tr: "JSON-LD @id başvurusu taranan sayfalarda hiç tanımlanmamış (varlık bağlanmaz). Tarama kapsamı dışındaki bir sayfada tanımlıysa yok say",
    en: "JSON-LD @id reference never defined on crawled pages (entity graph breaks). Ignore if defined on an uncrawled page",
    check: ({ pages, origin }) => {
      const defined = new Set();
      const refs = new Map();
      const walk = (v, u) => {
        if (Array.isArray(v)) return v.forEach((x) => walk(x, u));
        if (!v || typeof v !== "object") return;
        const keys = Object.keys(v);
        if (v["@id"] && v["@type"]) defined.add(String(v["@id"]));
        else if (v["@id"] && keys.length === 1 && String(v["@id"]).startsWith(origin)) refs.set(String(v["@id"]), refs.get(String(v["@id"])) ?? u);
        for (const [k, x] of Object.entries(v)) if (k !== "@context") walk(x, u);
      };
      for (const [u, p] of pages) for (const j of p.facts?.jsonLd ?? []) if (j.ok) walk(j.data, u);
      // Only judge ids whose document was crawled (or is the referring page): a link to an uncrawled page's
      // entity says nothing about that page.
      const doc = (s) => s.split("#")[0];
      return [...refs].filter(([id, u]) => !defined.has(id) && (doc(id) === doc(u) || pages.has(doc(id)))).map(([id, u]) => finding(u, id));
    },
  },
  {
    id: "schema-required-props",
    severity: "warn",
    tr: "Yapısal veride zorunlu özellik eksik (Organization: name/url/logo, Product: offers, Event: startDate/location, Dataset: description…); bu türün zengin sonucu ya da varlık bilgisi oluşmaz",
    en: "Structured data lacks a required property (Organization name/url/logo, Product offers, Event startDate/location, Dataset description…); no rich result / entity data for that type",
    check: ({ pages }) => missingProps(pages, "required"),
  },
  {
    id: "schema-recommended-props",
    severity: "info",
    tr: "Yapısal veride önerilen özellik eksik (Article: dateModified/publisher, Organization/Person: sameAs…) ya da uzun metinli sayfada Article türü yok. sameAs'e yalnız gerçek, kurumun/kişinin kendi profillerini yaz; gerçek profil yoksa uydurma, boş bırak",
    en: "Structured data lacks a recommended property (Article dateModified/publisher, Organization/Person sameAs…) or a long page has no Article type. Put only real, owned profiles in sameAs; if none exist, leave it out, never invent",
    check: ({ pages, start }) => [...missingProps(pages, "recommended"), ...articleCandidates(pages, start)],
  },
];
