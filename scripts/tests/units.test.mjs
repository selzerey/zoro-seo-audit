import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { sumStats } from "../bing.mjs";
import { payload } from "../indexnow.mjs";
import { scan } from "../leak-check.mjs";
import { parseArgs } from "../lib/args.mjs";
import { parseSitemap } from "../lib/crawl.mjs";
import { loadEnv, parseEnv } from "../lib/env.mjs";
import { cannibalisation, lowCtr, strikingDistance, urlVariants, zeroImpression } from "../lib/gsc-analysis.mjs";
import { extract } from "../lib/html.mjs";
import { isAllowed, parseRobots } from "../lib/robots.mjs";
import { clicheHits, jaccard } from "../lib/rules/content.mjs";
import { nodes } from "../lib/rules/schema.mjs";
import { pixelWidth } from "../lib/rules/util.mjs";

test("env: process.env wins, then files in order (first listed wins)", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "zoro-"));
  const f1 = path.join(d, "a.env");
  const f2 = path.join(d, "b.env");
  fs.writeFileSync(f1, 'A=1\nB="two" \n# c\nexport C=3 # note');
  fs.writeFileSync(f2, "A=9\nD=4");
  const e = loadEnv({ files: [f1, f2], base: { C: "env" } });
  assert.deepEqual([e.A, e.B, e.C, e.D], ["1", "two", "env", "4"]);
  assert.deepEqual(parseEnv("X='q r'"), { X: "q r" });
});

test("args", () => {
  assert.deepEqual(parseArgs(["u", "--max", "5", "--quiet"]), { _: ["u"], max: "5", quiet: true });
});

test("robots: longest match, Allow wins tie, named group beats *", () => {
  const r = parseRobots("User-agent: *\nDisallow: /admin\nAllow: /admin/public\nDisallow: /*.pdf$\n\nUser-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n\nSitemap: https://x.test/s.xml");
  assert.equal(isAllowed(r, "Googlebot", "https://x.test/admin/x"), false);
  assert.equal(isAllowed(r, "Googlebot", "https://x.test/admin/public/a"), true);
  assert.equal(isAllowed(r, "Googlebot", "https://x.test/a.pdf"), false);
  assert.equal(isAllowed(r, "Googlebot", "https://x.test/a.pdf?x"), true);
  assert.equal(isAllowed(r, "GPTBot", "https://x.test/"), false);
  assert.equal(isAllowed(r, "CCBot", "https://x.test/"), false);
  assert.equal(isAllowed(r, "ClaudeBot", "https://x.test/blog"), true);
  assert.deepEqual(r.sitemaps, ["https://x.test/s.xml"]);
  assert.equal(isAllowed(parseRobots("User-agent: *\nDisallow:"), "Googlebot", "https://x.test/a"), true);
});

test("sitemap: urlset, index, CDATA, entities", () => {
  const s = parseSitemap('<urlset><url><loc>https://x.test/a?b=1&amp;c=2</loc><lastmod>2026-01-02</lastmod></url><url><loc><![CDATA[https://x.test/b]]></loc></url></urlset>');
  assert.deepEqual(s.urls, [{ loc: "https://x.test/a?b=1&c=2", lastmod: "2026-01-02" }, { loc: "https://x.test/b", lastmod: null }]);
  assert.deepEqual(parseSitemap("<sitemapindex><sitemap><loc>https://x.test/1.xml</loc></sitemap></sitemapindex>").sitemaps, ["https://x.test/1.xml"]);
});

test("extract: canonical, robots, links, images, mixed content, text without chrome", () => {
  const f = extract(
    `<html lang="tr"><head><title> T </title><meta name="description" content="D"><meta name="robots" content="max-snippet:-1">
     <link rel="canonical" href="/a/"><script type="application/ld+json">{"@type":"Article"}</script><script type="application/ld+json">{bad</script></head>
     <body><header><a href="/menu">Menü</a></header><main><h1>Başlık</h1><img src="/hero.webp" loading="lazy" width="1200" height="630" alt="">
     <p>bir iki üç dört</p><a href="/b"></a><a href="http://other.test/x">dış</a><img src="http://cdn.test/i.png"><h2>Alt</h2><img src="/low.png"></main>
     <footer>altbilgi</footer></body></html>`,
    "https://x.test/a/",
  );
  assert.equal(f.title, "T");
  assert.equal(f.lang, "tr");
  assert.deepEqual(f.canonicals, ["/a/"]);
  assert.equal(f.robots, "max-snippet:-1");
  assert.equal(f.links.find((l) => l.raw === "/menu").inChrome, true);
  assert.equal(f.links.find((l) => l.raw === "/b").label, "");
  assert.deepEqual(f.mixedContent, ["http://cdn.test/i.png"]);
  assert.equal(f.images[0].beforeFirstH2, true);
  assert.equal(f.images[2].beforeFirstH2, false);
  assert.equal(f.images[2].hasAlt, false);
  assert.equal(f.jsonLd[0].ok, true);
  assert.equal(f.jsonLd[1].ok, false);
  assert.ok(!f.text.includes("Menü") && !f.text.includes("altbilgi"));
  assert.equal(f.text, "Başlık bir iki üç dört dış Alt");
  assert.equal(f.wordCount, 7);
});

test("schema nodes: @graph and nesting", () => {
  const n = nodes({ "@graph": [{ "@type": "Blog", blogPost: [{ "@type": "BlogPosting" }] }, { "@type": "Organization" }] }, { withNesting: true });
  assert.deepEqual(n.map((x) => [x.node["@type"], x.nested]), [["Blog", false], ["BlogPosting", true], ["Organization", false]]);
});

test("content helpers", () => {
  assert.deepEqual(clicheHits("Günümüzde... günümüzde! Sonuç olarak"), [["günümüzde", 2], ["sonuç olarak", 1]]);
  assert.equal(jaccard(new Set(["a", "b"]), new Set(["b", "c"])), 1 / 3);
  assert.ok(pixelWidth("WWWW") > pixelWidth("iiii"));
});

test("gsc analysis", () => {
  const rows = [
    { keys: ["kdv hesaplama", "/kdv/"], clicks: 5, impressions: 100, ctr: 0.05, position: 6 },
    { keys: ["kdv hesaplama", "/blog/kdv/"], clicks: 1, impressions: 60, ctr: 0.016, position: 9 },
    { keys: ["marka", "/"], clicks: 9, impressions: 80, ctr: 0.1, position: 1 },
    { keys: ["marka", "/hakkinda/"], clicks: 1, impressions: 40, ctr: 0.02, position: 2 },
  ];
  const c = cannibalisation(rows, { exclude: ["marka"] });
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].pages.map((p) => p.page), ["/kdv/", "/blog/kdv/"]);
  assert.deepEqual(strikingDistance(rows).map((r) => r.page), ["/kdv/", "/blog/kdv/"]);
  assert.deepEqual(lowCtr([{ keys: ["/p"], clicks: 1, impressions: 500, ctr: 0.002, position: 2 }]).map((r) => r.page), ["/p"]);
  assert.deepEqual(urlVariants([{ keys: ["https://x.test/a/"], impressions: 5 }, { keys: ["https://x.test/a"], impressions: 9 }, { keys: ["https://x.test/b/"], impressions: 1 }]).map((g) => g.length), [2]);
  assert.deepEqual(zeroImpression(["/a", "/b"], [{ keys: ["/a"] }]), ["/b"]);
});

test("bing sumStats merges days and weights position by impressions", () => {
  const s = sumStats([
    { Query: "q", Impressions: 10, Clicks: 1, AvgImpressionPosition: 2 },
    { Query: "q", Impressions: 30, Clicks: 0, AvgImpressionPosition: 6 },
  ]);
  assert.deepEqual(s, [{ key: "q", impressions: 40, clicks: 1, position: 5 }]);
});

test("indexnow payload rejects foreign hosts", () => {
  assert.equal(payload({ host: "x.test", key: "k", urls: ["https://x.test/a"] }).keyLocation, "https://x.test/k.txt");
  assert.throws(() => payload({ host: "x.test", key: "k", urls: ["https://y.test/a"] }));
});

test("leak scan: private words (Turkish case) and secrets", () => {
  assert.equal(scan("İSTANBUL", "f", ["istanbul"]).length, 1);
  assert.equal(scan("ok text", "f", ["gizli"]).length, 0);
  assert.match(scan("key=AIza" + "a".repeat(35), "f", [])[0], /Google API key/);
  assert.match(scan("postgres" + "://u:p@h/db", "f", [])[0], /database URL/);
});

test("false alarms: whole-phrase clichés, parameterised noindex pages are not a bot wall, local host normalisation", async () => {
  assert.deepEqual(clicheHits("Aliye adının günümüzdeki biçimi; günümüzdeki yazımı"), []);
  assert.deepEqual(clicheHits("Günümüzde bu ad sık verilir."), [["günümüzde", 1]]);
  const { botWalled } = await import("../lib/crawl.mjs");
  const page = (size, title = "İsim karşılaştır") => ({ fetch: { status: 200, headers: {}, size }, facts: { robots: "noindex, follow", title } });
  const tools = new Map(Array.from({ length: 12 }, (_, i) => [`https://x.test/karsilastir/?a=n${i}`, page(80000 + i * 900)]));
  assert.deepEqual(botWalled(tools), []); // same title, different content: noindex tool pages
  const wall = new Map(Array.from({ length: 12 }, (_, i) => [`https://x.test/p${i}/`, page(5120, "Kısa doğrulama")]));
  assert.equal(botWalled(wall).length, 12); // challenge title
  const same = new Map(Array.from({ length: 12 }, (_, i) => [`https://x.test/q${i}/`, page(4096, "Bir dakika")]));
  assert.equal(botWalled(same).length, 12); // one identical screen everywhere
  const site = (await import("../lib/rules/site.mjs")).default;
  const hn = site.find((r) => r.id === "host-normalisation");
  const ctx = (origin) => ({ origin, probes: { hosts: [{ url: origin.replace("//", "//www."), status: 200, chain: [{ status: 200, url: origin.replace("//", "//www.") + "/" }] }] } });
  assert.deepEqual(hn.check(ctx("http://localhost:3401")), []);
  assert.equal(hn.check(ctx("https://example.com")).length, 1);
});
