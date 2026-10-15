// End-to-end on a local fake site: planted problems must be found, known false-positive traps must stay quiet.
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { crawl } from "../lib/crawl.mjs";
import { runRules } from "../lib/rules/index.mjs";

let server;
let base;
const page = (title, body, head = "") => `<!doctype html><html lang="tr"><head><title>${title}</title><meta name="description" content="${title} açıklama">${head}</head><body><main>${body}</main></body></html>`;
const canon = (p) => `<link rel="canonical" href="${base}${p}">`;

function routes() {
  return {
    "/robots.txt": [200, "text/plain", `User-agent: *\nDisallow: /gizli/\nUser-agent: GPTBot\nDisallow: /\nSitemap: ${base}/sitemap.xml`],
    "/sitemap.xml": [200, "application/xml", `<urlset>${["/", "/a/", "/eski", "/kopya-1/", "/kopya-2/", "/noindex/", "/gizli/x/", "/duvar-1/", "/duvar-2/", "/duvar-3/"].map((p) => `<url><loc>${base}${p}</loc></url>`).join("")}</urlset>`],
    "/": [200, "text/html", page("Ana", `<h1>Ana</h1><img src="/hero.webp" width="1200" height="630" loading="lazy" alt="Kapak"><a href="/a/">A</a><a href="/eski">Eski</a><a href="/yok/">Kırık</a><a href="/kopya-1/">K1</a><a href="/kopya-2/">K2</a><a href="/blog/">Blog</a><h2>Alt</h2><img src="/alt.png" loading="lazy" width="400" height="300" alt="">`, canon("/") + '<meta name="robots" content="max-snippet:-1, max-image-preview:large">')],
    "/a/": [200, "text/html", page("A sayfası", `<h1>A</h1><p>metin</p><a href="/"></a>`, canon("/a/") + '<script type="application/ld+json">{"@type":"Dataset","name":"Oranlar","dateModified":"2020-01-01","creator":{"@type":"Organization","@id":"' + base + '/#org","name":"Site"}}</script>')],
    "/eski": [301, "text/plain", "", { location: "/a/" }],
    "/kopya-1/": [200, "text/html", page("Aynı başlık", `<h1>K</h1><p>${"benzer içerik cümlesi burada yer alıyor ve uzuyor ".repeat(40)}</p>`, canon("/kopya-1/"))],
    "/kopya-2/": [200, "text/html", page("Aynı başlık", `<h1>K</h1><p>${"benzer içerik cümlesi burada yer alıyor ve uzuyor ".repeat(40)}</p>`, canon("/kopya-2/") + `<link rel="canonical" href="${base}/x/">`)],
    "/duvar-1/": [200, "text/html", page("Kısa doğrulama", "<h1>Robot musun?</h1>", '<meta name="robots" content="noindex">')],
    "/duvar-2/": [200, "text/html", page("Kısa doğrulama", "<h1>Robot musun?</h1>", '<meta name="robots" content="noindex">')],
    "/duvar-3/": [200, "text/html", page("Kısa doğrulama", "<h1>Robot musun?</h1>", '<meta name="robots" content="noindex">')],
    "/noindex/": [200, "text/html", page("Gizli", "<h1>N</h1>", '<meta name="robots" content="noindex">')],
    "/blog/": [200, "text/html", page("Blog", "<h1>Blog</h1>", canon("/blog/") + '<script type="application/ld+json">{"@type":"Blog","publisher":{"@type":"Organization","name":"Site"},"blogPost":[{"@type":"BlogPosting","headline":"x"}]}</script>')],
  };
}

before(async () => {
  server = http.createServer((req, res) => {
    const r = routes()[req.url];
    if (!r) {
      res.writeHead(404, { "content-type": "text/html" });
      return res.end("yok");
    }
    res.writeHead(r[0], { "content-type": r[1] + "; charset=utf-8", ...(r[3] ?? {}) });
    res.end(req.method === "HEAD" ? undefined : r[2]);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test("crawl + rules on a fake site", async () => {
  const ctx = await crawl(base + "/", { max: 30, delay: 0, wallPause: 0, wallDelay: 0 });
  ctx.probes = { hosts: [] };
  const ids = new Map(runRules(ctx).map((r) => [r.id, r]));
  const urls = (id) => ids.get(id)?.findings.map((f) => f.url.replace(base, "")) ?? [];

  // Planted problems
  assert.deepEqual(urls("internal-link-broken"), ["/yok/"]);
  assert.deepEqual(urls("internal-link-redirect"), ["/eski"]);
  assert.ok(urls("sitemap-not-indexable").includes("/eski"));
  assert.ok(urls("sitemap-not-indexable").includes("/noindex/"));
  assert.ok(urls("sitemap-robots-blocked").includes("/gizli/x/"));
  assert.deepEqual(urls("canonical-multiple"), ["/kopya-2/"]);
  assert.deepEqual(urls("link-empty-text"), ["/a/"]);
  assert.deepEqual(urls("lcp-image-lazy"), ["/"]);
  assert.ok(urls("org-id-inconsistent").length === 1);
  assert.match(ids.get("ai-bot-access").findings[0].detail, /GPTBot\(ai-training\): BLOCK/);

  assert.deepEqual(urls("bot-wall").sort(), ["/duvar-1/", "/duvar-2/", "/duvar-3/"]);
  assert.ok(!urls("sitemap-not-indexable").some((u) => u.startsWith("/duvar")), "walled pages are not judged");

  // False-positive traps stay quiet
  assert.ok(!ids.has("search-bot-blocked"), "Googlebot is allowed");
  assert.ok(!ids.has("article-fields"), "BlogPosting nested in Blog is a list item, not the page's article");
  assert.ok(!ids.has("sitemap-lastmod-drift"), "Dataset dateModified is a data date");
  assert.ok(!ids.has("img-alt-missing"), 'alt="" is valid for decoration');
  assert.ok(!ids.has("mixed-content"), "http test site has no mixed content");
  assert.ok(!urls("canonical-missing").includes("/noindex/"), "noindex page needs no canonical");
});
