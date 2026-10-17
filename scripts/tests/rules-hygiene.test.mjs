// Leak, robots, head, canonical, snippet, date, link-hygiene and architecture rules. Each test plants a problem the
// rule must find and a trap it must ignore (Turkish text, code samples, JSON-LD, partial crawls, the audited host).
import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { botWalled, crawl } from "../lib/crawl.mjs";
import { extract, headScan } from "../lib/html.mjs";
import { contentSignals, parseRobots, robotsSyntax } from "../lib/robots.mjs";
import { parseStale } from "../lib/rules/content.mjs";
import { runRules } from "../lib/rules/index.mjs";
import { devHostReason } from "../lib/rules/links.mjs";
import { headerDirectives } from "../lib/rules/util.mjs";

const O = "https://site.test";
const doc = (body, head = "", { lang = "tr", charset = true, viewport = true } = {}) =>
  `<!doctype html><html lang="${lang}"><head>${charset ? '<meta charset="utf-8">' : ""}${viewport ? '<meta name="viewport" content="width=device-width, initial-scale=1">' : ""}<title>Sayfa başlığı</title>${head}</head><body>${body}</body></html>`;
/** A crawled page built from real HTML (status 200, one hop). */
const page = (url, html, headers = {}) => [url, { fetch: { status: 200, finalUrl: url, chain: [{ url, status: 200 }], headers: { "content-type": "text/html; charset=utf-8", ...headers }, ms: 10 }, facts: extract(html, url) }];
const ctxOf = (pages, extra = {}) => ({
  start: `${O}/`,
  origin: O,
  robots: parseRobots(extra.robotsBody ?? "User-agent: *\nAllow: /"),
  robotsStatus: 200,
  robotsTxt: { status: 200, type: "text/plain", body: extra.robotsBody ?? "User-agent: *\nAllow: /", bytes: 30 },
  sitemap: { urls: new Map(), sitemaps: [], problems: [] },
  pages: new Map(pages),
  linkStatus: new Map(),
  probes: { hosts: [] },
  ...extra,
});
const run = (ctx, id) => runRules(ctx, { only: [id] }).find((r) => r.id === id)?.findings ?? [];
const urls = (ctx, id) => run(ctx, id).map((f) => f.url);

test("placeholder-leak: shortcodes and JS values in text; code samples, JSON-LD, scripts and prose words are ignored", () => {
  const leak = doc(`<main><h1>Asgari ücret {yil}</h1><p>Net tutar {asgari_ucret_net} TL. Toplam: NaN ₺</p><p>[object Object]</p><table><tr><td>Brüt</td><td>undefined</td></tr></table></main>`);
  const clean = doc(
    `<main><h1>Şablon nasıl yazılır?</h1><p>Kodda değişkeni süslü parantezle yazın:</p><pre><code>const s = \`\${user_name}\`; // {{ ad }} {asgari_ucret}</code></pre>
     <p>The null hypothesis is undefined until tested. Oran %20, faiz %3,5.</p><p>TODO listesi uygulaması: yapılacaklar.</p>
     <script>var t = "{site_adi}"; var x = NaN;</script></main>`,
    `<script type="application/ld+json">{"@type":"WebPage","name":"{sayfa_adi}"}</script>`,
  );
  const ctx = ctxOf([page(`${O}/leak/`, leak), page(`${O}/clean/`, clean)]);
  const f = run(ctx, "placeholder-leak");
  assert.deepEqual(f.map((x) => x.url), [`${O}/leak/`]);
  for (const s of ["{yil}", "{asgari_ucret_net}", "NaN", "[object Object]"]) assert.ok(f[0].detail.includes(s), s);
  // Listed literal spellings are matched exactly too.
  const custom = ctxOf([page(`${O}/c/`, doc("<p>Fiyat [[FIYAT]] TL</p>"))], { placeholders: ["[[FIYAT]]"] });
  assert.deepEqual(urls(custom, "placeholder-leak"), [`${O}/c/`]);
});

test("markdown-leak: raw links, ::: blocks, table rules; single stars, code and C++ scopes are ignored", () => {
  const leak = doc(`<main><p>Kaynak: [Resmî Gazete](https://www.resmigazete.gov.tr/)</p><p>:::uyari Bu bilgi değişebilir</p></main>`);
  const bold = doc(`<main><p>Bu **önemli** ve şu da **çok önemli**.</p></main>`);
  const clean = doc(`<main><p>Fiyat* vergi dahildir. *Kampanya koşulları geçerlidir.</p><p>Bir kez **vurgu** yapıldı.</p><p>std::vector ve saat 10:30.</p><pre>## Başlık\n[x](https://a.b)\n|---|---|</pre></main>`);
  const ctx = ctxOf([page(`${O}/leak/`, leak), page(`${O}/bold/`, bold), page(`${O}/clean/`, clean)]);
  assert.deepEqual(urls(ctx, "markdown-leak").sort(), [`${O}/bold/`, `${O}/leak/`]);
});

test("mojibake: UTF-8 read as Latin-1 is found; real Turkish letters and Portuguese are not", () => {
  const bad = doc(`<main><p>ÃœrÃ¼n fiyatÄ± ve ÅŸehir bilgisi â€™</p></main>`);
  const good = doc(`<main><p>Çağrı ılık İstanbul şöyle Ünye kâr îmân Ümraniye ÖĞRENCİ. SÃO PAULO ve Ärger.</p></main>`);
  const one = doc(`<main><p>Tek bozuk karakter � burada.</p></main>`);
  const ctx = ctxOf([page(`${O}/bad/`, bad), page(`${O}/good/`, good), page(`${O}/one/`, one)]);
  assert.deepEqual(urls(ctx, "mojibake"), [`${O}/bad/`], "two or more hits needed");
});

test("charset-missing: no meta charset and no charset header; a header charset is enough", () => {
  const html = doc("<p>x</p>", "", { charset: false });
  const ctx = ctxOf([page(`${O}/a/`, html, { "content-type": "text/html" }), page(`${O}/b/`, html), page(`${O}/c/`, doc("<p>x</p>"), { "content-type": "text/html" })]);
  assert.deepEqual(urls(ctx, "charset-missing"), [`${O}/a/`]);
});

test("viewport-missing: absent or fixed width; device-width passes", () => {
  const ctx = ctxOf([
    page(`${O}/a/`, doc("<p>x</p>", "", { viewport: false })),
    page(`${O}/b/`, doc("<p>x</p>", '<meta name="viewport" content="width=1024">', { viewport: false })),
    page(`${O}/c/`, doc("<p>x</p>")),
  ]);
  assert.deepEqual(urls(ctx, "viewport-missing"), [`${O}/a/`, `${O}/b/`]);
});

test("stale-fact: old value outside a past-year context; tables with years, longer numbers and no list stay quiet", () => {
  const stale = parseStale("# eski değerler\nAsgari ücret net: 17.002,12 | 20.002,50");
  assert.deepEqual(stale, [{ label: "Asgari ücret net", values: ["17.002,12", "20.002,50"] }]);
  const bad = doc(`<main><h2>Güncel asgari ücret</h2><p>Net asgari ücret 17.002,12 TL olarak uygulanıyor.</p></main>`);
  const good = doc(
    `<main><h2>Yıllara göre asgari ücret</h2><table><tr><th>Yıl</th><th>Net</th></tr><tr><td>2025</td><td>17.002,12</td></tr></table>
     <h2>2024 yılı</h2><p>O yıl net tutar 20.002,50 TL'ydi.</p><h2>Diğer</h2><p>Toplam 117.002,12 TL ve 17.002,123 birim. Önceki tutar 17.002,12 TL idi.</p></main>`,
  );
  const pages = [page(`${O}/bad/`, bad), page(`${O}/good/`, good)];
  assert.deepEqual(urls(ctxOf(pages, { stale }), "stale-fact"), [`${O}/bad/`]);
  assert.deepEqual(run(ctxOf(pages), "stale-fact"), [], "silent without a list");
  assert.deepEqual(parseStale('[{"label":"KDV","old":["%18"]}]'), [{ label: "KDV", values: ["%18"] }]);
  assert.deepEqual(parseStale("A: 1 | 2; 3").map((r) => r.values), [["1", "2"], ["3"]]);
});

test("head-invalid-element: element that closes <head> before canonical/robots; valid noscript and SVG titles are fine", () => {
  const broken = `<!doctype html><html><head><meta charset="utf-8"><title>T</title><img src="/px.gif"><link rel="canonical" href="${O}/a/"><meta name="robots" content="noindex"></head><body><p>x</p></body></html>`;
  const gtm = `<!doctype html><html><head><title>T</title><noscript><iframe src="https://gtm.example/ns"></iframe></noscript><link rel="canonical" href="${O}/b/"></head><body></body></html>`;
  const ok = `<!doctype html><html><head><title>İstanbul — Şehir</title><noscript><link rel="stylesheet" href="/a.css"></noscript><script>var a = "<div>";</script><link rel="canonical" href="${O}/c/"></head><body><svg><title>ikon</title></svg><noscript><img src="/p.gif"></noscript></body></html>`;
  assert.deepEqual(headScan(broken), { invalid: "<img>", lost: ["canonical", "meta robots"], bodyCanonicals: 0 });
  const ctx = ctxOf([page(`${O}/a/`, broken), page(`${O}/b/`, gtm), page(`${O}/c/`, ok)]);
  assert.deepEqual(urls(ctx, "head-invalid-element"), [`${O}/a/`, `${O}/b/`]);
  assert.deepEqual(urls(ctx, "head-duplicate-meta"), [], "SVG <title> is not a second page title");
  const dup = ctxOf([page(`${O}/d/`, doc("<p>x</p>", '<meta name="description" content="a"><meta name="description" content="b">'))]);
  assert.match(run(dup, "head-duplicate-meta")[0].detail, /2 descriptions/);
});

test("canonical family: header conflict, canonical in body, noindex conflicts, chains and loops; self canonicals pass", () => {
  const c = (u) => `<link rel="canonical" href="${u}">`;
  const pages = [
    page(`${O}/h/`, doc("<p>x</p>", c(`${O}/h/`)), { link: `<${O}/other/>; rel="canonical"` }),
    page(`${O}/h-ok/`, doc("<p>x</p>", c(`${O}/h-ok/`)), { link: `<${O}/h-ok/>; rel="canonical", </f.woff2>; rel=preload` }),
    page(`${O}/body/`, `<!doctype html><html><head><title>T</title></head><body><link rel="canonical" href="${O}/body/"></body></html>`),
    page(`${O}/to-ni/`, doc("<p>x</p>", c(`${O}/ni/`))),
    page(`${O}/ni/`, doc("<p>x</p>", '<meta name="robots" content="noindex, follow">')),
    page(`${O}/p?a=1`, doc("<p>x</p>", c(`${O}/p`) + '<meta name="robots" content="noindex">')),
    page(`${O}/p?a=2`, doc("<p>x</p>", c(`${O}/p`) + '<meta name="robots" content="noindex">')),
    page(`${O}/p`, doc("<p>x</p>", c(`${O}/p`))),
    page(`${O}/a/`, doc("<p>x</p>", c(`${O}/b/`))),
    page(`${O}/b/`, doc("<p>x</p>", c(`${O}/c/`))),
    page(`${O}/c/`, doc("<p>x</p>", c(`${O}/c/`))),
    page(`${O}/l1/`, doc("<p>x</p>", c(`${O}/l2/`))),
    page(`${O}/l2/`, doc("<p>x</p>", c(`${O}/l1/`))),
  ];
  const ctx = ctxOf(pages);
  assert.deepEqual(urls(ctx, "canonical-header-conflict"), [`${O}/h/`]);
  assert.deepEqual(urls(ctx, "canonical-outside-head"), [`${O}/body/`]);
  const nc = run(ctx, "canonical-noindex-conflict").map((f) => f.detail);
  assert.ok(nc.includes(`canonical target ${O}/ni/ is noindex`));
  assert.ok(nc.some((d) => d.startsWith(`noindex + canonical → ${O}/p (2 pages`)), "noindex variants grouped per target");
  const ch = run(ctx, "canonical-chain");
  assert.ok(ch.some((f) => f.url === `${O}/a/` && f.detail === `${O}/a/ → ${O}/b/ → ${O}/c/`));
  assert.ok(ch.some((f) => f.url === `${O}/l1/` && /^loop/.test(f.detail)));
  assert.ok(!ch.some((f) => f.url === `${O}/c/` || f.url === `${O}/b/` && /loop/.test(f.detail)));
  // A canonical target blocked by robots.txt is a conflict too.
  const blocked = ctxOf([page(`${O}/x/`, doc("<p>x</p>", c(`${O}/gizli/x/`)))], { robotsBody: "User-agent: *\nDisallow: /gizli/" });
  assert.match(run(blocked, "canonical-noindex-conflict")[0].detail, /blocked by robots/);
});

test("snippet-restricted and robots-directive-conflict: real restrictions and contradictions only", () => {
  assert.deepEqual(headerDirectives("googlebot: nosnippet, otherbot: noindex"), ["nosnippet"]);
  assert.deepEqual(headerDirectives("max-snippet:20, noarchive"), ["max-snippet:20", "noarchive"]);
  const long = `<main><p>${"Uzun metin cümlesi burada. ".repeat(20)}</p></main>`;
  const pages = [
    page(`${O}/ns/`, doc(long, '<meta name="robots" content="nosnippet">')),
    page(`${O}/ms/`, doc(long), { "x-robots-tag": "max-snippet:20" }),
    page(`${O}/dn/`, doc(`<main><div data-nosnippet>${"Gizli metin burada. ".repeat(30)}</div><p>kısa</p></main>`)),
    page(`${O}/ok/`, doc(long, '<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">'), { "x-robots-tag": "otherbot: nosnippet" }),
    page(`${O}/conf/`, doc(long, '<meta name="robots" content="index, follow">'), { "x-robots-tag": "noindex" }),
    page(`${O}/agree/`, doc(long, '<meta name="robots" content="noindex"><meta name="googlebot" content="noindex, max-snippet:-1">')),
  ];
  const ctx = ctxOf(pages);
  assert.deepEqual(urls(ctx, "snippet-restricted"), [`${O}/ns/`, `${O}/ms/`, `${O}/dn/`]);
  const rc = run(ctx, "robots-directive-conflict");
  assert.deepEqual(rc.map((f) => f.url), [`${O}/conf/`]);
  assert.match(rc[0].detail, /index \(meta robots\) vs noindex \(X-Robots-Tag\)/);
});

test("robots.txt: unreachable vs missing, syntax problems, Content-Signal conflicts", () => {
  const base = ctxOf([]);
  assert.equal(run({ ...base, robotsStatus: 503 }, "robots-unreachable").length, 1);
  assert.equal(run({ ...base, robotsStatus: 503 }, "robots-missing").length, 0, "5xx is not 'missing'");
  assert.equal(run({ ...base, robotsStatus: 404 }, "robots-unreachable").length, 0);
  assert.equal(run({ ...base, robotsStatus: 404 }, "robots-missing").length, 1);

  const bad = "Disallow: /x/\nUser-agent: *\nNoindex: /y/\nSitemap: /sitemap.xml\nthis line is junk";
  const p = robotsSyntax(bad);
  assert.equal(p.length, 4);
  assert.match(p.join(" "), /before any User-agent.*unknown directive "Noindex".*absolute URL.*not "key: value"/);
  assert.deepEqual(robotsSyntax("<!doctype html><html></html>", { type: "text/html" }), ["served as HTML, not a robots.txt"]);
  const good = "\uFEFF# comment\nUser-agent: *\nContent-Signal: search=yes, ai-train=no\nAllow: /\nCrawl-delay: 1\n\nSitemap: https://site.test/sitemap.xml";
  assert.deepEqual(robotsSyntax(good), []);

  const sig = (body) => run(ctxOf([], { robotsBody: body }), "content-signal-conflict");
  assert.match(sig("User-agent: *\nContent-Signal: search=yes, ai-input=no\nAllow: /")[0].detail, /ai-input=no while OAI-SearchBot/);
  const cf = "# BEGIN Cloudflare Managed content\nUser-agent: ClaudeBot\nDisallow: /\nUser-agent: Claude-SearchBot\nDisallow: /\n# END Cloudflare Managed Content\nUser-agent: *\nAllow: /";
  assert.match(sig(cf)[0].detail, /Cloudflare-managed block blocks Claude-SearchBot/);
  // Traps: the default Cloudflare signal (search yes, no training) and a managed block that only stops training bots.
  assert.deepEqual(sig("User-agent: *\nContent-Signal: search=yes, ai-train=no\nAllow: /"), []);
  assert.deepEqual(sig("# BEGIN Cloudflare Managed content\nUser-agent: GPTBot\nDisallow: /\n# END\nUser-agent: *\nAllow: /"), []);
  assert.deepEqual(contentSignals("Content-Signal: search=yes, ai-input=yes").signals, { search: "yes", "ai-input": "yes" });
});

test("robots-blocks-assets: same-host CSS/JS/images behind Disallow; other paths and other hosts pass", () => {
  const html = doc(`<img src="/_next/image?url=a.png" alt="">`, `<script src="/_next/static/chunks/a.js"></script><link rel="stylesheet" href="/_next/static/css/b.css"><script src="https://cdn.example/x.js"></script>`);
  const blocked = ctxOf([page(`${O}/`, html)], { robotsBody: "User-agent: *\nDisallow: /_next/\nDisallow: /api/" });
  const f = run(blocked, "robots-blocks-assets");
  assert.equal(f.length, 3, "one finding per folder");
  assert.ok(f.every((x) => x.url.startsWith(`${O}/_next/`)));
  assert.deepEqual(run(ctxOf([page(`${O}/`, html)], { robotsBody: "User-agent: *\nDisallow: /api/" }), "robots-blocks-assets"), []);
});

test("soft-404: made-up URL answering 200 and 200 'not found' pages; a real 404 and a long 404 article pass", () => {
  const nf = { url: `${O}/zoro-yok-x`, status: 200, finalUrl: `${O}/`, chain: [{ status: 301 }, { status: 200 }], title: "Ana sayfa", noindex: false };
  const pages = [
    page(`${O}/eski/`, doc("<main><h1>Sayfa Bulunamadı</h1><p>Aradığınız sayfa taşınmış olabilir.</p></main>").replace("Sayfa başlığı", "Bulunamadı")),
    page(`${O}/blog/404-hatasi/`, doc(`<main><h1>404 hatası nedir?</h1><p>${"Sunucu bu adreste sayfa olmadığını söyler. ".repeat(40)}</p></main>`)),
    page(`${O}/ara/?q=x`, doc("<main><h1>Sonuç bulunamadı</h1></main>", '<meta name="robots" content="noindex">')),
  ];
  const f = run(ctxOf(pages, { notFound: nf }), "soft-404");
  assert.deepEqual(f.map((x) => x.url), [`${O}/zoro-yok-x`, `${O}/eski/`]);
  assert.match(f[0].detail, /redirects to/);
  const ok = run(ctxOf(pages.slice(1), { notFound: { ...nf, status: 404, chain: [{ status: 404 }] } }), "soft-404");
  assert.deepEqual(ok, []);
});

test("soft-404 probe in the crawl: a catch-all 200 server is found", async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": req.url === "/robots.txt" ? "text/plain" : "text/html; charset=utf-8" });
    res.end(req.url === "/robots.txt" ? "User-agent: *\nAllow: /" : doc("<main><h1>Hoş geldiniz</h1></main>"));
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const ctx = await crawl(base + "/", { max: 3, delay: 0, wallPause: 0, wallDelay: 0 });
    assert.equal(ctx.notFound.status, 200);
    assert.equal(ctx.robotsTxt.body, "User-agent: *\nAllow: /");
    assert.equal(run({ ...ctx, probes: { hosts: [] } }, "soft-404").length, 1);
  } finally {
    server.close();
  }
});

test("crawl: identical noindex tool pages are not a bot wall; sitemap URLs on another host are not crawled", async () => {
  const tool = doc(`<main><h1>Karşılaştır</h1><p>${"İki ismi yan yana koy, anlamını ve kökenini gör. ".repeat(30)}</p></main>`, '<meta name="robots" content="noindex, follow">');
  const pages = new Map(Array.from({ length: 12 }, (_, i) => page(`${O}/karsilastir/?a=n${i}`, tool)));
  for (const p of pages.values()) p.fetch.size = tool.length;
  assert.deepEqual(botWalled(pages), []);
  const wall = doc("<main><h1>Robot musun?</h1></main>", '<meta name="robots" content="noindex">');
  const walls = new Map(Array.from({ length: 12 }, (_, i) => page(`${O}/w${i}/`, wall)));
  for (const p of walls.values()) p.fetch.size = wall.length;
  assert.equal(botWalled(walls).length, 12);

  let other = 0;
  const foreign = http.createServer((req, res) => (other++, res.writeHead(200, { "content-type": "text/html" }), res.end(doc("<p>başka</p>"))));
  await new Promise((ok) => foreign.listen(0, "127.0.0.1", ok));
  const fb = `http://127.0.0.1:${foreign.address().port}`;
  const server = http.createServer((req, res) => {
    if (req.url === "/robots.txt") return res.writeHead(200, { "content-type": "text/plain" }), res.end(`User-agent: *\nAllow: /\nSitemap: http://${req.headers.host}/sitemap.xml`);
    if (req.url === "/sitemap.xml") return res.writeHead(200, { "content-type": "application/xml" }), res.end(`<urlset><url><loc>${fb}/a/</loc></url></urlset>`);
    res.writeHead(req.url === "/" ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
    res.end(doc("<main><h1>Ana</h1></main>"));
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  try {
    const ctx = await crawl(`http://127.0.0.1:${server.address().port}/`, { max: 5, delay: 0, wallPause: 0, wallDelay: 0 });
    assert.equal(other, 0, "the other host was never fetched");
    assert.equal(ctx.pages.size, 1);
  } finally {
    server.close();
    foreign.close();
  }
});

test("sitemap-lastmod-uniform and datemodified-uniform: one stamped day vs real dates; Dataset dates excluded", () => {
  const day = (i) => `2026-0${(i % 9) + 1}-1${i % 9}`;
  const same = new Map(Array.from({ length: 30 }, (_, i) => [`${O}/p${i}/`, i < 28 ? "2026-10-17T03:00:00Z" : "2026-01-02"]));
  const spread = new Map(Array.from({ length: 30 }, (_, i) => [`${O}/p${i}/`, day(i)]));
  assert.match(run(ctxOf([], { sitemap: { urls: same, sitemaps: [`${O}/sitemap.xml`], problems: [] } }), "sitemap-lastmod-uniform")[0].detail, /^28\/30 lastmod = 2026-10-17/);
  assert.deepEqual(run(ctxOf([], { sitemap: { urls: spread, sitemaps: [], problems: [] } }), "sitemap-lastmod-uniform"), []);
  assert.deepEqual(run(ctxOf([], { sitemap: { urls: new Map([...same].slice(0, 10)), sitemaps: [], problems: [] } }), "sitemap-lastmod-uniform"), [], "small sitemaps skipped");

  const ld = (t, d) => `<script type="application/ld+json">${JSON.stringify({ "@type": t, dateModified: d })}</script>`;
  const stamped = Array.from({ length: 12 }, (_, i) => page(`${O}/y${i}/`, doc("<p>x</p>", ld("BlogPosting", "2026-10-17T10:00:00+03:00"))));
  assert.match(run(ctxOf(stamped), "datemodified-uniform")[0].detail, /12\/12 pages dateModified = 2026-10-17/);
  const data = Array.from({ length: 12 }, (_, i) => page(`${O}/d${i}/`, doc("<p>x</p>", ld("Dataset", "2026-01-01"))));
  assert.deepEqual(run(ctxOf(data), "datemodified-uniform"), []);
});

test("link-not-crawlable: onclick navigation; buttons and in-page anchors pass", () => {
  const bad = doc(`<a onclick="location.href='/x/'">Git</a><span onclick="window.location='/y/'">Y</span><a href="javascript:window.open('/z/')">Z</a>`);
  const ok = doc(`<a href="#icerik">İçeriğe geç</a><button onclick="toggleMenu()">Menü</button><a href="/x/" onclick="track('x')">X</a>`);
  const ctx = ctxOf([page(`${O}/bad/`, bad), page(`${O}/ok/`, ok)]);
  const f = run(ctx, "link-not-crawlable");
  assert.deepEqual(f.map((x) => x.url), [`${O}/bad/`]);
  assert.match(f[0].detail, /^3:/);
});

test("link-dev-host: localhost/preview/file refs; the audited host itself (also on localhost) is not a leak", () => {
  assert.equal(devHostReason("http://localhost:3401/a/", "http://localhost:3401/"), null);
  assert.equal(devHostReason("http://127.0.0.1:3401/a/", "http://localhost:3401/"), null, "loopback alias, same port");
  assert.equal(devHostReason("http://localhost:3000/api", "http://localhost:3401/"), "localhost", "another local server");
  assert.equal(devHostReason("https://staging.site.test/x", `${O}/`), "staging/preview subdomain");
  assert.equal(devHostReason("https://app-git-main.vercel.app/", `${O}/`, ["vercel.app"]), "configured dev host");
  assert.equal(devHostReason("https://example.org/", `${O}/`), null);
  const bad = doc(`<a href="http://localhost:3000/x/">x</a><img src="file:///C:/Users/a.png" alt="">`, `<link rel="canonical" href="http://127.0.0.1:8080/">`);
  const ok = doc(`<a href="${O}/a/">a</a><a href="https://www.mevzuat.gov.tr/">Mevzuat</a><pre><code>curl http://localhost:3000/</code></pre><a href="/b/">b</a>`);
  const ctx = ctxOf([page(`${O}/bad/`, bad), page(`${O}/ok/`, ok)], { sitemap: { urls: new Map([["http://localhost:3400/a/", null]]), sitemaps: [`${O}/sitemap.xml`, "http://localhost:3400/sitemaps/pages.xml"], problems: [] } });
  const f = run(ctx, "link-dev-host");
  assert.deepEqual(f.map((x) => x.url), [`${O}/bad/`, "http://localhost:3400/sitemaps/pages.xml", "http://localhost:3400/a/"]);
  for (const s of ["localhost:3000/x/ (localhost)", "file:///C:/Users/a.png (local file path)", "127.0.0.1:8080/ (localhost)"]) assert.ok(f[0].detail.includes(s), s);
  // Local audit: links to the audited localhost host are the site's own links.
  const L = "http://localhost:3401";
  const local = { ...ctxOf([page(`${L}/`, doc(`<a href="${L}/isim/">i</a>`, `<link rel="canonical" href="${L}/">`))]), start: `${L}/`, origin: L };
  assert.deepEqual(run(local, "link-dev-host"), []);
});

test("internal-link-tracking-params: utm/session ids on internal links; external utm links and pagination pass", () => {
  const bad = doc(`<a href="/kampanya/?utm_source=mail&utm_medium=x">K</a><a href="/sepet;jsessionid=AB12">S</a>`);
  const ok = doc(`<a href="https://partner.example/?utm_source=site">P</a><a href="/isimler/?sayfa=2">2</a><a href="/ara/?q=utm">ara</a>`);
  const ctx = ctxOf([page(`${O}/bad/`, bad), page(`${O}/ok/`, ok)]);
  const f = run(ctx, "internal-link-tracking-params");
  assert.deepEqual(f.map((x) => x.url), [`${O}/bad/`]);
  assert.match(f[0].detail, /^2:/);
});

test("click-depth: deep pages on a complete crawl; a partial crawl never claims depth past what it saw", () => {
  const chain = (n, extra = {}) =>
    Array.from({ length: n }, (_, i) => {
      const u = i ? `${O}/d${i}/` : `${O}/`;
      const next = i < n - 1 ? `<a href="/d${i + 1}/">ileri</a>` : "";
      return page(u, doc(`<main>${next}${extra[i] ?? ""}</main>`, `<link rel="canonical" href="${u}">`));
    });
  const full = ctxOf(chain(7));
  assert.deepEqual(run(full, "click-depth").map((f) => f.detail), ["depth 5", "depth 6"]);
  // Layer 1 also links an uncrawled page: depths beyond 2 are not exact any more.
  const partial = ctxOf(chain(7, { 1: '<a href="/kisayol/">kısa yol</a>' }));
  assert.deepEqual(run(partial, "click-depth"), []);
  // nofollow links do not count as a path.
  const nf = ctxOf([...chain(3), page(`${O}/x/`, doc("<p>x</p>"))].map(([u, p]) => (u === `${O}/` ? page(u, doc('<a href="/d1/">1</a><a href="/x/" rel="nofollow">x</a>')) : [u, p])));
  assert.deepEqual(run(nf, "click-depth"), []);
});

test("inbound-chrome-only: in the menu of many pages but never linked from content; legal pages, hubs and thin evidence pass", () => {
  const nav = `<nav><a href="/arac/">Araç</a><a href="/gizlilik/">Gizlilik</a><a href="/hub/">Hub</a></nav>`;
  const filler = Array.from({ length: 20 }, (_, i) => page(`${O}/y${i}/`, doc(`<header>${nav}</header><main><p>yazı</p><a href="/yazi/">ilgili yazı</a></main>`)));
  const hubLinks = Array.from({ length: 30 }, (_, i) => `<a href="/y${i}/">y${i}</a>`).join("");
  const pages = [
    ...filler,
    page(`${O}/arac/`, doc("<main><h1>Araç</h1></main>")),
    page(`${O}/gizlilik/`, doc("<main><h1>Gizlilik</h1></main>")),
    page(`${O}/hub/`, doc(`<main><h1>Hub</h1>${hubLinks}</main>`)),
    page(`${O}/yazi/`, doc(`<main><h1>Yazı</h1><a href="/yazi/">kendisi</a></main>`)),
    page(`${O}/tek/`, doc("<main><h1>Tek</h1></main>")),
    page(`${O}/`, doc(`<footer><a href="/tek/">Tek</a></footer>`)),
  ];
  const f = run(ctxOf(pages, { sitemap: { urls: new Map(Array.from({ length: 200 }, (_, i) => [`${O}/s${i}/`, null])), sitemaps: [], problems: [] } }), "inbound-chrome-only");
  assert.deepEqual(f.map((x) => x.url), [`${O}/arac/`], "/tek/ has one nav link on a partial crawl: no evidence");
  assert.match(f[0].detail, /^20 page/);
});
