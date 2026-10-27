// Rules added from real site work (bebek isimleri, 2026-10): favicon, closed site, near-duplicate titles, brandless
// short titles, page-level schema, dangling @id, query URLs in the sitemap. Planted problem + trap for each.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRobots } from "../lib/robots.mjs";
import { runRules } from "../lib/rules/index.mjs";

const O = "https://site.test";
const page = (url, facts = {}, headers = {}) => [
  url,
  {
    fetch: { status: 200, finalUrl: url, chain: [{ url, status: 200 }], headers: { "content-type": "text/html", ...headers }, ms: 10 },
    facts: { url, title: "T", description: "d", robots: "", googlebot: "", canonicals: [url], links: [], images: [], jsonLd: [], h1: ["x"], headings: [], icons: [], text: "", wordCount: 300, ...facts },
  },
];
const ld = (data) => ({ ok: true, data });
const ctxOf = (pages, { robots = "User-agent: *\nAllow: /", sitemap = [], favicon } = {}) => ({
  start: `${O}/`,
  origin: O,
  robots: parseRobots(robots),
  robotsStatus: 200,
  sitemap: { urls: new Map(sitemap.map((u) => [u, null])), sitemaps: [], problems: [] },
  pages: new Map(pages),
  linkStatus: new Map(),
  probes: { hosts: [], favicon },
});
const ids = (ctx, only) => new Map(runRules(ctx, { only }).map((r) => [r.id, r]));

test("favicon-missing: broken or absent icon is found, a working one is not", () => {
  const p = [page(`${O}/`)];
  assert.ok(ids(ctxOf(p, { favicon: { url: `${O}/favicon.ico`, declared: false, status: 404, type: "text/html" } }), ["favicon-missing"]).has("favicon-missing"));
  assert.ok(!ids(ctxOf(p, { favicon: { url: `${O}/icon`, declared: true, status: 200, type: "image/png" } }), ["favicon-missing"]).has("favicon-missing"));
});

test("site-closed: one finding and the per-page noindex/sitemap noise is dropped", () => {
  const ni = { robots: "noindex, nofollow" };
  const pages = [page(`${O}/`, ni), page(`${O}/a/`, ni), page(`${O}/b/`, ni)];
  const r = ids(ctxOf(pages, { robots: "User-agent: *\nDisallow: /", sitemap: [`${O}/`, `${O}/a/`] }));
  assert.ok(r.has("site-closed"));
  assert.ok(!r.has("sitemap-not-indexable") && !r.has("search-bot-blocked") && !r.has("sitemap-robots-blocked"));
  // Trap: an open site with a few noindex pages is not "closed".
  const open = ids(ctxOf([page(`${O}/`), page(`${O}/a/`, ni)], { sitemap: [`${O}/a/`] }));
  assert.ok(!open.has("site-closed") && open.has("sitemap-not-indexable"));
});

test("title-near-duplicate ignores template words, catches two pages on one query", () => {
  const names = ["Defne", "Alya", "Zeynep", "Asel", "Umay", "Duru", "Elif", "Ela"].map((n) => page(`${O}/isim/${n.toLowerCase()}/`, { title: `${n} isminin anlamı nedir, ne demek? Kız ismi` }));
  const pages = [...names, page(`${O}/kategori/kiz-isimleri/`, { title: "Kız bebek isimleri listesi" }), page(`${O}/isimler/?g=f`, { title: "Kız bebek isimleri ve listesi" })];
  const f = ids(ctxOf(pages), ["title-near-duplicate"]).get("title-near-duplicate")?.findings ?? [];
  assert.equal(f.length, 1, "only the category/listing pair, not the templated name pages");
  assert.match(f[0].detail, /isimler\/\?g=f/);
});

test("title-near-duplicate: a template word only one title has is a difference; short words count", () => {
  const filler = Array.from({ length: 12 }, (_, i) => page(`${O}/isim/n${i}/`, { title: `Ad${i} isminin anlamı nedir? ${i % 2 ? "Kız" : "Erkek"} ismi` }));
  const pages = [...filler, page(`${O}/kiz/`, { title: "Kız bebek isimleri ve anlamları" }), page(`${O}/erkek/`, { title: "Erkek bebek isimleri ve anlamları" }), page(`${O}/isim/mira/`, { title: "Mira isminin anlamı nedir? Kız ismi" }), page(`${O}/isim/mira-su/`, { title: "Mira Su isminin anlamı nedir? Kız ismi" })];
  assert.ok(!ids(ctxOf(pages), ["title-near-duplicate"]).has("title-near-duplicate"));
});

test("schema-dangling-id skips ids on uncrawled pages", () => {
  const g = ld({ "@context": "https://schema.org", "@graph": [{ "@type": "BlogPosting", "@id": `${O}/rehber/a/#post`, mentions: [{ "@id": `${O}/isim/ayse/#term` }], isPartOf: { "@id": `${O}/rehber/a/#breadcrumb` } }] });
  const f = ids(ctxOf([page(`${O}/rehber/a/`, { jsonLd: [g] })]), ["schema-dangling-id"]).get("schema-dangling-id")?.findings.map((x) => x.detail) ?? [];
  assert.deepEqual(f, [`${O}/rehber/a/#breadcrumb`]);
});

test("title-no-brand flags short brandless titles only", () => {
  const site = ld({ "@context": "https://schema.org", "@graph": [{ "@type": "WebSite", name: "Bebek İsimleri" }] });
  const pages = [page(`${O}/`, { title: "Bebek İsimleri ve anlamları", jsonLd: [site] }), page(`${O}/iletisim/`, { title: "İletişim" }), page(`${O}/hakkimizda/`, { title: "Hakkımızda · Bebek İsimleri" })];
  const f = ids(ctxOf(pages), ["title-no-brand"]).get("title-no-brand")?.findings.map((x) => x.url) ?? [];
  assert.deepEqual(f, [`${O}/iletisim/`]);
});

test("page-entity-missing and schema-dangling-id", () => {
  const crumb = ld({ "@type": "BreadcrumbList", itemListElement: [] });
  const pageGraph = ld({ "@context": "https://schema.org", "@graph": [{ "@type": "ItemPage", "@id": `${O}/isim/defne/#webpage`, mainEntity: { "@id": `${O}/isim/defne/#term` } }, { "@type": "DefinedTerm", "@id": `${O}/isim/defne/#term`, inDefinedTermSet: { "@id": `${O}/isim/defne/#termset` } }] });
  const pages = [page(`${O}/a/`, { jsonLd: [crumb] }), page(`${O}/isim/defne/`, { jsonLd: [pageGraph] })];
  const r = ids(ctxOf(pages), ["page-entity-missing", "schema-dangling-id"]);
  assert.deepEqual(r.get("page-entity-missing").findings.map((x) => x.url), [`${O}/a/`]);
  assert.deepEqual(r.get("schema-dangling-id").findings.map((x) => x.detail), [`${O}/isim/defne/#termset`], "#term is defined, #termset is not");
});

test("sitemap-query-url", () => {
  const r = ids(ctxOf([page(`${O}/`)], { sitemap: [`${O}/isimler/`, `${O}/isimler/?g=f`] }), ["sitemap-query-url"]);
  assert.deepEqual(r.get("sitemap-query-url").findings.map((x) => x.url), [`${O}/isimler/?g=f`]);
});

test("favicon-blocked: icon (or a redirect hop to it) disallowed for Googlebot-Image; an allowed icon and a foreign CDN hop are fine", () => {
  const p = [page(`${O}/`)];
  const robots = "User-agent: *\nDisallow: /static/\n\nUser-agent: Googlebot-Image\nDisallow: /assets/icons/";
  const direct = { url: `${O}/assets/icons/fav.png`, declared: true, status: 200, type: "image/png", chain: [{ url: `${O}/assets/icons/fav.png`, status: 200 }] };
  assert.ok(ids(ctxOf(p, { robots, favicon: direct }), ["favicon-blocked"]).has("favicon-blocked"), "named Googlebot-Image group blocks the icon");
  const viaRedirect = { url: `${O}/favicon.ico`, declared: false, status: 200, type: "image/x-icon", chain: [{ url: `${O}/favicon.ico`, status: 301 }, { url: `${O}/static/fav.ico`, status: 200 }] };
  const r = ids(ctxOf(p, { robots, favicon: viaRedirect }), ["favicon-blocked"]).get("favicon-blocked");
  assert.ok(r && /redirect/.test(r.findings[0].detail), "the hop after the redirect is under a * Disallow");
  const fine = { url: `${O}/favicon.ico`, declared: false, status: 200, type: "image/x-icon", chain: [{ url: `${O}/favicon.ico`, status: 200 }] };
  assert.ok(!ids(ctxOf(p, { robots, favicon: fine }), ["favicon-blocked"]).has("favicon-blocked"));
  // Trap: a redirect to another host is outside this robots.txt; a 404 icon is favicon-missing's job, not this rule's.
  const cdn = { url: `${O}/favicon.ico`, declared: false, status: 200, type: "image/x-icon", chain: [{ url: `${O}/favicon.ico`, status: 302 }, { url: "https://cdn.test/static/fav.ico", status: 200 }] };
  assert.ok(!ids(ctxOf(p, { robots, favicon: cdn }), ["favicon-blocked"]).has("favicon-blocked"));
  assert.ok(!ids(ctxOf(p, { robots, favicon: { ...direct, status: 404 } }), ["favicon-blocked"]).has("favicon-blocked"));
});

test("hidden-keyword-repetition: term stuffed into JSON-LD/alt but rare in the text; a page that uses it in the copy is fine", () => {
  const stuffedLd = ld({ "@type": "Product", name: "Kombi servisi", description: Array(16).fill("kombi servisi").join(", "), keywords: Array(6).fill("kombi").join(" ") });
  const stuffed = page(`${O}/kombi/`, { title: "Kombi servisi İstanbul", text: "Kombi arızanızı aynı gün tamir ederiz. Ücretsiz keşif, garanti.", wordCount: 300, jsonLd: [stuffedLd], images: Array(5).fill({ src: "/a.jpg", hasAlt: true, alt: "kombi servisi kombi", loading: "", beforeFirstH2: false }) });
  const r = ids(ctxOf([stuffed]), ["hidden-keyword-repetition"]).get("hidden-keyword-repetition");
  assert.ok(r && /"kombi": 1× visible, \d+× in JSON-LD/.test(r.findings[0].detail), r?.findings[0].detail);
  // Trap: the same term used naturally in long copy with modest structured data.
  const natural = page(`${O}/kombi2/`, { title: "Kombi servisi İstanbul", text: Array(30).fill("kombi servisi için randevu alın").join(". "), wordCount: 300, jsonLd: [ld({ "@type": "Service", name: "Kombi servisi" })], images: [{ src: "/a.jpg", hasAlt: true, alt: "kombi", loading: "", beforeFirstH2: false }] });
  assert.ok(!ids(ctxOf([natural]), ["hidden-keyword-repetition"]).has("hidden-keyword-repetition"));
  // Trap: no title term (title missing) → nothing to compare.
  assert.ok(!ids(ctxOf([page(`${O}/x/`, { title: "", jsonLd: [stuffedLd] })]), ["hidden-keyword-repetition"]).has("hidden-keyword-repetition"));
});
