// Language packs and hreflang. Each test plants a problem the rule must find and a trap it must ignore.
import assert from "node:assert/strict";
import { test } from "node:test";
import { extract } from "../lib/html.mjs";
import { anyPhrase, base, fold, LANGS, PACKS, UTILITY_PATH, words } from "../lib/lang.mjs";
import { parseRobots } from "../lib/robots.mjs";
import { clicheHits, sentences } from "../lib/rules/content.mjs";
import { runRules } from "../lib/rules/index.mjs";
import { hreflangProblem } from "../lib/rules/hreflang.mjs";

const O = "https://site.test";
const page = (url, html, status = 200) => [url, { fetch: { status, finalUrl: url, chain: [{ url, status }], headers: { "content-type": "text/html" }, ms: 5 }, facts: extract(html, url) }];
const ctxOf = (pages) => ({
  start: `${O}/`,
  origin: O,
  robots: parseRobots("User-agent: *\nAllow: /"),
  robotsStatus: 200,
  robotsTxt: { status: 200, type: "text/plain", body: "User-agent: *\nAllow: /", bytes: 22 },
  sitemap: { urls: new Map(), sitemaps: [], problems: [] },
  pages: new Map(pages),
  linkStatus: new Map(),
  probes: { hosts: [] },
});
const sorted = (h) => [...h].sort((a, b) => a[0].localeCompare(b[0]));
const ids = (ctx, only) => runRules(ctx, { only }).map((r) => r.id);
const alt = (list) => list.map(([l, h]) => `<link rel="alternate" hreflang="${l}" href="${h}">`).join("");
const html = (lang, head, body = "<main><p>Text</p></main>") => `<!doctype html><html lang="${lang}"><head><title>T ${lang}</title>${head}</head><body>${body}</body></html>`;

test("packs: every language has every list, lists are lower-case and unique", () => {
  const keys = Object.keys(PACKS.en);
  for (const code of LANGS) {
    assert.deepEqual(Object.keys(PACKS[code]).sort(), [...keys].sort(), code);
    for (const k of keys) {
      const list = PACKS[code][k];
      assert.ok(list.length > 0, `${code}.${k} empty`);
      assert.equal(new Set(list).size, list.length, `${code}.${k} has duplicates`);
      for (const w of list) assert.equal(w, w.toLocaleLowerCase(code), `${code}.${k}: "${w}" is not lower-case`);
    }
  }
});

test("case folding: English capital I is not Turkish dotless ı; Turkish İ still matches", () => {
  assert.deepEqual(sorted(clicheHits("In Today's World, we DELVE INTO it.", "en")), [["delve into", 1], ["in today's world", 1]]);
  assert.deepEqual(sorted(clicheHits("GÜNÜMÜZDE İnsanlar", "tr")), [["günümüzde", 1]]);
  assert.equal(fold("İSTANBUL"), fold("istanbul"));
  assert.equal(fold("IT"), "it");
  assert.equal(base("pt-BR"), "pt");
});

test("clichés: page language list only; unknown language checks every list", () => {
  assert.deepEqual(sorted(clicheHits("Zusammenfassend lässt sich sagen: es ist wichtig zu beachten.", "de-AT")), [["es ist wichtig zu beachten", 1], ["zusammenfassend lässt sich sagen", 1]]);
  assert.deepEqual(sorted(clicheHits("Hoy en día, en conclusión, todo cambia.", "es")), [["en conclusión", 1], ["hoy en día", 1]]);
  assert.deepEqual(clicheHits("Hoy en día todo cambia.", "en"), []);
  assert.deepEqual(sorted(clicheHits("Hoy en día todo cambia.", null)), [["hoy en día", 1]]);
});

test("sentences: German and French abbreviations; Japanese via Intl.Segmenter", () => {
  assert.deepEqual(sentences("Das gilt z.B. für Dr. Weber. Er kam ca. um drei. Fertig.", "de"), ["Das gilt z.B. für Dr. Weber.", "Er kam ca. um drei.", "Fertig."]);
  assert.deepEqual(sentences("M. Dupont arrive. Il part.", "fr"), ["M. Dupont arrive.", "Il part."]);
  assert.deepEqual(sentences("今日は晴れです。明日は雨です。", "ja"), ["今日は晴れです。", "明日は雨です。"]);
});

test("words: CJK text is segmented instead of counted as one word", () => {
  assert.ok(words("東京は日本の首都です").length >= 4);
  assert.equal(words("one two  three").length, 3);
});

test("history and soft-404 phrases: short words need a word end, long ones may continue", () => {
  const h = anyPhrase("history");
  assert.ok(h.test(fold("Der Preis war 5 €")));
  assert.ok(!h.test(fold("washing machine")));
  assert.ok(h.test(fold("Geçmişte oran %18'di")));
  const nf = anyPhrase("notFound");
  for (const t of ["Seite nicht gefunden", "Page introuvable", "Página no encontrada", "Страница не найдена", "Sayfa bulunamadı"]) assert.ok(nf.test(fold(t)), t);
  assert.ok(!nf.test(fold("Found: the best pages")));
});

test("utility pages: legal and contact slugs in many languages", () => {
  for (const p of ["/impressum", "/datenschutz/", "/mentions-legales", "/aviso-legal", "/privacy-policy", "/kvkk-metni", "/o-nas"]) assert.ok(UTILITY_PATH.test(p), p);
  assert.ok(!UTILITY_PATH.test("/blog/seo-tips"));
});

test("soft-404: 'Error 404' title on a 200 page", () => {
  const ctx = ctxOf([page(`${O}/`, html("en", "")), page(`${O}/gone`, html("en", "").replace("<title>T en</title>", "<title>Error 404</title>"))]);
  ctx.probes.soft404 = null;
  const r = runRules(ctx, { only: ["soft-404"] });
  assert.ok(r.some((x) => x.findings.some((f) => f.url === `${O}/gone`)), JSON.stringify(r));
});

test("hreflang values", () => {
  for (const ok of ["en", "en-GB", "pt-BR", "zh-Hant", "zh-Hant-TW", "es-419", "x-default", "EN-us"]) assert.equal(hreflangProblem(ok), null, ok);
  assert.match(hreflangProblem("en-UK"), /GB/);
  assert.match(hreflangProblem("jp"), /ja/);
  assert.match(hreflangProblem("eng"), /en/);
  assert.match(hreflangProblem("en_US"), /hyphen/);
  assert.match(hreflangProblem("english"), /form/);
  assert.match(hreflangProblem("en-ZZ"), /unknown region/);
});

test("hreflang: return links, self reference, conflicts, bad targets; a complete set passes", () => {
  const en = `${O}/en/`, de = `${O}/de/`, fr = `${O}/fr/`, old = `${O}/old/`;
  const good = alt([["en", en], ["de", de], ["x-default", en]]);
  const okCtx = ctxOf([page(en, html("en", good)), page(de, html("de", good))]);
  assert.deepEqual(ids(okCtx, ["hreflang-invalid", "hreflang-conflict", "hreflang-self-missing", "hreflang-no-return", "hreflang-target-bad"]), []);

  const ctx = ctxOf([
    page(en, html("en", alt([["en", en], ["de", de], ["fr", fr], ["it", old], ["en-UK", en]]))),
    page(de, html("de", alt([["de", de]]))), // does not link back to en
    page(fr, html("fr", alt([["en", en], ["de", de]]))), // lists no fr (itself)
    page(old, html("it", ""), 404),
    page(`${O}/x/`, html("en", alt([["en", `${O}/x/`], ["de", de], ["de", fr]]))),
  ]);
  const r = Object.fromEntries(runRules(ctx).map((x) => [x.id, x.findings.map((f) => `${f.url} ${f.detail}`)]));
  assert.ok(r["hreflang-no-return"].some((s) => s.includes(`de → ${de}`)));
  assert.ok(r["hreflang-self-missing"].some((s) => s.startsWith(fr)));
  assert.ok(r["hreflang-target-bad"].some((s) => s.includes("status 404")));
  assert.ok(r["hreflang-invalid"].some((s) => s.includes("en-uk")));
  assert.ok(r["hreflang-conflict"].some((s) => s.includes('"de"')));
});
