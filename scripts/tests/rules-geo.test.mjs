// AI-search / GEO rules: schema properties, date signals, raw-HTML extractability, citability (Turkish-aware),
// llms.txt, HSTS, feeds, twitter:card. Planted problem + trap for each.
import assert from "node:assert/strict";
import { test } from "node:test";
import { extract } from "../lib/html.mjs";
import { parseRobots } from "../lib/robots.mjs";
import { sentences } from "../lib/rules/content.mjs";
import { runRules } from "../lib/rules/index.mjs";
import { llmsFormat } from "../lib/rules/site.mjs";

const O = "https://site.test";
const page = (url, facts = {}, headers = {}) => [
  url,
  {
    fetch: { status: 200, finalUrl: url, chain: [{ url, status: 200 }], headers: { "content-type": "text/html", ...headers }, ms: 10 },
    facts: { url, title: "T", description: "d", robots: "", googlebot: "", canonicals: [url], links: [], images: [], jsonLd: [], h1: ["x"], headings: [], icons: [], text: "", wordCount: 300, ...facts },
  },
];
const ld = (data) => ({ ok: true, data });
const ctxOf = (pages, { start = `${O}/`, llms } = {}) => ({
  start,
  origin: new URL(start).origin,
  robots: parseRobots("User-agent: *\nAllow: /"),
  robotsStatus: 200,
  sitemap: { urls: new Map(), sitemaps: [], problems: [] },
  pages: new Map(pages),
  linkStatus: new Map(),
  probes: { hosts: [], llms },
});
const run = (ctx, id) => runRules(ctx, { only: [id] }).find((r) => r.id === id)?.findings ?? [];
const html = (body, head = "") => `<!doctype html><html lang="tr"><head><title>T</title>${head}</head><body>${body}</body></html>`;

test("schema props: org judged once over the crawl (reference copies are fine), Product needs offers", () => {
  const org = { "@type": "Organization", "@id": `${O}/#organization`, name: "Site", url: `${O}/`, logo: `${O}/logo.png` };
  const ref = { "@type": "Organization", "@id": `${O}/#organization`, name: "Site" };
  const pages = [
    page(`${O}/`, { jsonLd: [ld({ "@graph": [org, { "@type": "WebSite", name: "Site", url: `${O}/` }] })] }),
    page(`${O}/yazi/`, { jsonLd: [ld({ "@type": "BlogPosting", headline: "h", dateModified: "2026-01-01", publisher: ref })] }),
    page(`${O}/urun/`, { jsonLd: [ld({ "@type": "Product", name: "P" })] }),
  ];
  assert.deepEqual(run(ctxOf(pages), "schema-required-props").map((f) => f.detail), ["Product: offers|review|aggregateRating"]);
  const rec = run(ctxOf(pages), "schema-recommended-props").map((f) => f.detail);
  assert.ok(rec.includes(`Organization ${O}/#organization: sameAs`), "sameAs is a recommendation");
  assert.ok(!rec.some((d) => d.startsWith("BlogPosting")), "BlogPosting has dateModified + publisher");
  // Trap: the org without logo on its only full node is a real gap.
  const noLogo = [page(`${O}/`, { jsonLd: [ld({ ...org, logo: undefined })] })];
  assert.match(run(ctxOf(noLogo), "schema-required-props")[0].detail, /logo/);
});

test("schema-recommended-props suggests Article only for long pages that are not tools, terms or listings", () => {
  const long = { wordCount: 900 };
  const pages = [
    page(`${O}/`, long),
    page(`${O}/rehber/a/`, { ...long, jsonLd: [ld({ "@type": "WebPage", name: "A" })] }),
    page(`${O}/isim/defne/`, { ...long, jsonLd: [ld({ "@graph": [{ "@type": "ItemPage" }, { "@type": "DefinedTerm", name: "Defne" }] })] }),
    page(`${O}/kategori/`, { ...long, jsonLd: [ld({ "@type": "CollectionPage" })] }),
    page(`${O}/arac/kredi/`, { ...long, jsonLd: [ld({ "@type": "WebApplication", name: "H", applicationCategory: "x", operatingSystem: "Any", offers: {} })] }),
    page(`${O}/kisa/`, { wordCount: 300 }),
  ];
  assert.deepEqual(run(ctxOf(pages), "schema-recommended-props").map((f) => f.url), [`${O}/rehber/a/`]);
});

test("freshness-missing: one site finding with examples; noindex pages and dated pages do not count", () => {
  const pages = [
    page(`${O}/`, { jsonLd: [ld({ "@type": "WebPage", dateModified: "2026-01-01" })] }),
    page(`${O}/a/`, { metaDates: ["2026-01-01"] }),
    page(`${O}/b/`, { timeCount: 1 }),
    page(`${O}/arac/`),
    page(`${O}/gizli/`, { robots: "noindex" }),
  ];
  const f = run(ctxOf(pages), "freshness-missing");
  assert.equal(f.length, 1);
  assert.match(f[0].detail, /^1\/4 \(25%\) e\.g\. https:\/\/site\.test\/arac\/$/);
  assert.equal(run(ctxOf(pages.filter(([u]) => !u.endsWith("/arac/"))), "freshness-missing").length, 0);
});

test("content-extractability: empty app root is flagged, a server-rendered Next page is not", () => {
  const spa = extract(html('<div id="root"></div><noscript>JS gerekli</noscript><script src="/app.js"></script>'), `${O}/spa/`);
  const bare = extract(html('<script src="/bundle.js"></script>'), `${O}/bare/`);
  const prose = "<p>" + "Bebek isimleri sözlüğü anlam ve köken bilgisi verir. ".repeat(40) + "</p>";
  const ssr = extract(html(`<div id="__next"><header><a href="/">Ana</a></header><main><h1>Başlık</h1>${prose}</main></div><div id="app"></div><script src="/_next/a.js"></script>`), `${O}/ssr/`);
  const urls = run(ctxOf([[`${O}/spa/`, { ...page(`${O}/spa/`)[1], facts: spa }], [`${O}/bare/`, { ...page(`${O}/bare/`)[1], facts: bare }], [`${O}/ssr/`, { ...page(`${O}/ssr/`)[1], facts: ssr }]]), "content-extractability").map((f) => f.url);
  assert.deepEqual(urls, [`${O}/spa/`, `${O}/bare/`], "an empty portal root (#app) next to real content is not a shell");
});

test("sentences: Turkish abbreviations, ordinals and decimals do not end a sentence", () => {
  assert.deepEqual(sentences("Dr. Ayşe Hz. Ömer'i anlattı. 19. yy. sonunda ör. bu ad vb. adlar yayıldı. 3. sınıfta 1.250 öğrenci var! A. Yılmaz yazdı.", "tr"), [
    "Dr. Ayşe Hz. Ömer'i anlattı.",
    "19. yy. sonunda ör. bu ad vb. adlar yayıldı.",
    "3. sınıfta 1.250 öğrenci var!",
    "A. Yılmaz yazdı.",
  ]);
  assert.deepEqual(sentences("See e.g. the docs. Mr. Smith paid 3.5 dollars. Done.", "en"), ["See e.g. the docs.", "Mr. Smith paid 3.5 dollars.", "Done."]);
});

test("citability: long section and 35+ word sentences are found; tables and lists do not inflate a section", () => {
  const long = "Bu isim eski Türkçede ışık anlamına gelir ve özellikle kuzey illerinde sevilerek kullanılır. ";
  const longSentence = `Bu anlatım ${"çok uzun ve virgüllerle bağlanmış bir anlatım, ".repeat(6)}sonunda biter. `;
  const bad = extract(html(`<main><h1>Ad</h1><p>Giriş.</p><h2>Kökeni</h2><p>${long.repeat(35)}</p></main>`), `${O}/kotu/`);
  const wordy = extract(html(`<main><h1>Ad</h1><h2>Kullanım</h2><p>${longSentence.repeat(5)}${long.repeat(10)}</p></main>`), `${O}/cumle/`);
  const rows = Array.from({ length: 80 }, (_, i) => `<tr><td>İsim ${i}</td><td>anlamı ve kökeni burada yazar</td></tr>`).join("");
  const items = Array.from({ length: 60 }, (_, i) => `<li>Liste öğesi ${i} kısa açıklama metni</li>`).join("");
  const good = extract(html(`<main><h1>Ad</h1><h2>Liste</h2><p>${long.repeat(5)}</p><table>${rows}</table><ul>${items}</ul><h2>Not</h2><p>${long.repeat(10)}</p></main>`), `${O}/iyi/`);
  const pg = (u, facts) => [u, { ...page(u)[1], facts }];
  const f = run(ctxOf([pg(`${O}/kotu/`, bad), pg(`${O}/cumle/`, wordy), pg(`${O}/iyi/`, good)]), "citability");
  assert.deepEqual(f.map((x) => x.url), [`${O}/kotu/`, `${O}/cumle/`]);
  assert.match(f[0].detail, /^"Kökeni" 4\d\dw$/);
  assert.match(f[1].detail, /^5\/15 sentences 35\+ words$/);
});

test("llms-txt: absent is an optional note, broken format/links are reported, a good file is silent", () => {
  const good = "# Site\n\n> Kısa özet.\n\n## Bölümler\n- [Rehber](https://site.test/rehber/): yazılar\n";
  assert.deepEqual(llmsFormat(good), []);
  assert.equal(llmsFormat("Site\nmetin").length, 3);
  const p = [page(`${O}/`)];
  const probe = (x) => ({ url: `${O}/llms.txt`, type: "text/plain", body: good, links: [{ url: `${O}/rehber/`, status: 200, hops: 1 }], status: 200, ...x });
  assert.match(run(ctxOf(p, { llms: probe({ status: 404, body: "" }) }), "llms-txt")[0].detail, /optional/);
  assert.match(run(ctxOf(p, { llms: probe({ type: "text/html; charset=utf-8" }) }), "llms-txt")[0].detail, /not present/, "SPA catch-all HTML is not an llms.txt");
  assert.equal(run(ctxOf(p, { llms: probe() }), "llms-txt").length, 0);
  assert.match(run(ctxOf(p, { llms: probe({ links: [{ url: `${O}/eski/`, status: 404, hops: 1 }] }) }), "llms-txt")[0].detail, /1 link\(s\) not 200/);
});

test("https-hsts: missing header on https is a warning; http and localhost stay silent", () => {
  assert.equal(run(ctxOf([page(`${O}/`)]), "https-hsts").length, 1);
  assert.equal(run(ctxOf([page(`${O}/`, {}, { "strict-transport-security": "max-age=31536000" })]), "https-hsts").length, 0);
  assert.equal(run(ctxOf([page("http://site.test/")], { start: "http://site.test/" }), "https-hsts").length, 0);
  assert.equal(run(ctxOf([page("https://localhost:3400/")], { start: "https://localhost:3400/" }), "https-hsts").length, 0);
});

test("feed-missing: article pages without a feed link; a Blog listing with nested posts is not an article page", () => {
  const post = (i) => page(`${O}/rehber/${i}/`, { jsonLd: [ld({ "@context": "https://schema.org", "@graph": [{ "@type": "BlogPosting", headline: `h${i}` }] })] });
  const posts = [post(1), post(2), post(3)];
  assert.equal(run(ctxOf(posts), "feed-missing").length, 1);
  assert.equal(run(ctxOf([...posts, page(`${O}/`, { feeds: [`${O}/rss.xml`] })]), "feed-missing").length, 0);
  const listing = page(`${O}/blog/`, { jsonLd: [ld({ "@type": "Blog", blogPost: [1, 2, 3].map((i) => ({ "@type": "BlogPosting", headline: `h${i}` })) })] });
  assert.equal(run(ctxOf([listing]), "feed-missing").length, 0);
});

test("twitter-card-missing only when og:image exists", () => {
  const pages = [page(`${O}/a/`, { ogImage: "/og.png" }), page(`${O}/b/`, { ogImage: "/og.png", twitterCard: "summary_large_image" }), page(`${O}/c/`)];
  assert.deepEqual(run(ctxOf(pages), "twitter-card-missing").map((f) => f.url), [`${O}/a/`]);
});
