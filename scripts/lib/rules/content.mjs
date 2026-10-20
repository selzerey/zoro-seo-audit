// Content: leaks (shortcodes, Markdown, mojibake, stale values), thin pages, near-duplicates, AI boilerplate, dates, citability.
// Citability limits (400-word sections, 35-word sentences) adapted from seomator-geo-audit thresholds.json,
// Copyright (c) 2026 SEOmator — MIT License (THIRD_PARTY_NOTICES.md).
import { anyPhrase, base, fold, pack, PACKS, words } from "../lang.mjs";
import { nodes } from "./schema.mjs";
import { finding, indexable } from "./util.mjs";

/** Phrases that mark mass-produced AI text (per language, scripts/lib/lang.mjs). A hint for a human edit, not a score. */
export const CLICHES = [...new Set(Object.values(PACKS).flatMap((p) => p.cliches))];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Whole phrases only: "günümüzde" is the cliché opener, "günümüzdeki biçimi" (a dictionary fact) is not.
const cliche = (c) => [c, new RegExp(`(?<!\\p{L})${esc(fold(c))}(?!\\p{L})`, "gu")];
const CLICHE_RE = new Map(Object.entries(PACKS).map(([code, p]) => [code, p.cliches.map(cliche)]));
const CLICHE_ALL = CLICHES.map(cliche);

/** Cliché counts of a text, using the page language's list (every list when the language is unknown). */
export function clicheHits(text, lang = null) {
  const t = fold(text);
  const hits = [];
  for (const [c, re] of CLICHE_RE.get(base(lang)) ?? CLICHE_ALL) {
    const n = (t.match(re) ?? []).length;
    if (n) hits.push([c, n]);
  }
  return hits.sort((a, b) => b[1] - a[1]);
}

function shingles(text, k = 5) {
  const w = words(fold(text));
  const s = new Set();
  for (let i = 0; i + k <= w.length; i++) s.add(w.slice(i, i + k).join(" "));
  return s;
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

const sentenceSeg = new Map();

/**
 * Sentences of one text block. A period is not a sentence end after a known abbreviation (the page language's pack),
 * a single capital initial ("A. Yılmaz"), or when the next word starts lower-case ("3. sınıf", "vb. gibi"). Decimal
 * points never match. Languages without a pack (Japanese, Chinese, Arabic, Hindi …) use Intl.Segmenter.
 */
export function sentences(text, lang = "en") {
  const p = pack(lang);
  if (!p && typeof Intl.Segmenter === "function") {
    const code = base(lang) ?? "en";
    if (!sentenceSeg.has(code)) {
      let seg;
      try {
        seg = new Intl.Segmenter(code, { granularity: "sentence" });
      } catch {
        seg = new Intl.Segmenter("en", { granularity: "sentence" });
      }
      sentenceSeg.set(code, seg);
    }
    return [...sentenceSeg.get(code).segment(text)].map((s) => s.segment.trim()).filter(Boolean);
  }
  const l = p ? base(lang) : "en";
  const abbr = new Set((p ?? PACKS.en).abbr);
  const out = [];
  let start = 0;
  for (const m of text.matchAll(/[.!?…]+["'”’)\]]*(?=\s|$)/g)) {
    const end = m.index + m[0].length;
    const last = text.slice(start, m.index).split(/\s+/).pop() ?? "";
    const next = text.slice(end).trimStart()[0];
    if (m[0][0] === ".") {
      const tok = last.replace(/^[("'“‘[]+/, "").toLocaleLowerCase(l);
      if (abbr.has(tok) || /^\p{Lu}$/u.test(last) || (next && /\p{Ll}/u.test(next))) continue;
    }
    const s = text.slice(start, end).trim();
    if (s) out.push(s);
    start = end;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/** Citability problems of one page: long sections, long text without sub-headings, many 35+ word sentences. */
export function citability(facts, lang, { sectionWords = 400, longWords = 35, longShare = 0.2, minSentences = 10 } = {}) {
  const out = [];
  const secs = facts.sections ?? [];
  const hasSub = secs.some((s) => s.level >= 2);
  for (const s of secs) {
    if (s.words <= sectionWords) continue;
    if (s.level >= 2 || (s.level === 1 && hasSub)) out.push(`"${s.heading.slice(0, 50)}" ${s.words}w`);
    else out.push(`${s.words}w without sub-headings`);
  }
  const sent = (facts.blocks ?? []).flatMap((b) => sentences(b, lang)).map((x) => words(x).length).filter((n) => n >= 3);
  const long = sent.filter((n) => n >= longWords).length;
  if (sent.length >= minSentences && long >= 3 && long / sent.length >= longShare) out.push(`${long}/${sent.length} sentences ${longWords}+ words`);
  return out;
}

/** Does the page carry any date: JSON-LD datePublished/dateModified, article:*_time meta or a <time> element? */
export function hasDate(facts) {
  if (facts.metaDates?.length || facts.timeCount) return true;
  return (facts.jsonLd ?? []).some((j) => j.ok && nodes(j.data).some((n) => n.dateModified || n.datePublished || n.uploadDate));
}

/** Visible text of a page as lines: title and description first (a leak there reaches the result snippet). */
const lineTexts = (f) => [f.title, f.description, ...(f.lines ?? []).map((l) => l.text)].filter(Boolean);

const L = "\\p{Ll}";
/**
 * Unrendered template or shortcode syntax and leaked JavaScript values. Code samples (code/pre/kbd), scripts,
 * JSON-LD and hidden elements never reach this text. `undefined` / `null` count only as a whole value (alone in a
 * line or table cell, or next to a number, currency or unit), never as an English word in a sentence.
 */
export const PLACEHOLDERS = [
  ["{{ }}", /\{\{[^{}\n]{1,60}\}\}/g],
  ["${ }", /\$\{[^{}\n]{1,60}\}/g],
  ["{key}", new RegExp(`\\{[${L}][${L}0-9_]{1,40}\\}`, "gu")],
  ["[object Object]", /\[object Object\]/g],
  ["Invalid Date", /\bInvalid Date\b/g],
  ["NaN", /(?<![\p{L}\p{N}])NaN(?![\p{L}\p{N}])/gu],
  ["TODO/FIXME", /\b(?:TODO|FIXME)\b(?=\s*[:(])|\bFIXME\b/g],
  ["lorem ipsum", /lorem ipsum/gi],
  ["%s", /(?<![\p{L}\p{N}%])%[sd](?![\p{L}\p{N}])/gu],
  ["undefined/null", /(?:^|¦)\s*(?:undefined|null)\s*(?=¦|$)|[\d₺$€%]\s*(?:undefined|null)\b|\b(?:undefined|null)\s*(?:[₺$€%]|TL\b)/g],
];

/** Placeholder hits of a page: [pattern, sample] pairs. `extra` = literal shortcode spellings from the settings. */
export function placeholderHits(f, extra = []) {
  const out = [];
  const lits = extra.map((x) => (/^[{[<%$]/.test(x) ? x : `{${x}}`));
  for (const line of lineTexts(f)) {
    for (const [name, re] of PLACEHOLDERS) for (const m of line.matchAll(re)) out.push([name, m[0].replace(/¦/g, "").trim() || name]);
    for (const lit of lits) if (line.includes(lit)) out.push(["listed", lit]);
  }
  return out;
}

/**
 * Raw Markdown or block syntax that reached the page. Unambiguous forms ([text](url), "## " line starts, ::: / ::
 * blocks, |---| table rules) count once; **bold** / __bold__ need two hits, since a lone pair of stars can be typed on
 * purpose. Single stars (footnotes, "*Vergi dahil") never count.
 */
export function markdownHits(f) {
  const strong = [];
  let soft = 0;
  const STRONG = [
    ["[text](url)", /\[[^\]\n]{1,100}\]\((?:https?:\/\/|\/)[^)\s]*\)/g],
    ["## heading", /^#{1,6}\s+\p{L}/gu],
    [":::block", new RegExp(`(?:^|\\s):{2,3}[${L}][\\w-]*`, "gu")],
    ["|---|", /\|\s*:?-{3,}:?\s*\|/g],
  ];
  for (const line of (f.lines ?? []).map((l) => l.text)) {
    for (const [name, re] of STRONG) for (const m of line.matchAll(re)) strong.push(`${name}: ${m[0].trim().slice(0, 40)}`);
    soft += (line.match(/\*\*(?=\S)[^*\n]*\p{L}[^*\n]*?(?<=\S)\*\*/gu) ?? []).length;
    soft += (line.match(/(?<![\p{L}\p{N}_])__(?=\S)[^_\n]*\p{L}[^_\n]* [^_\n]*(?<=\S)__(?![\p{L}\p{N}_])/gu) ?? []).length;
  }
  if (soft >= 2) strong.push(`**bold** ×${soft}`);
  return strong;
}

/**
 * UTF-8 bytes shown as Latin-1 / Windows-1252: "Ã¼" (ü), "Ã§" (ç), "Ä±" (ı), "ÅŸ" (ş), "ÄŸ" (ğ), "Ä°" (İ), "â€™" (’) and
 * the replacement character U+FFFD. Real Turkish letters (ç ğ ı İ ö ş ü â î û) and words like "SÃO" never match.
 */
export const MOJIBAKE = /Ã[\u0080-¿ŒœŠšŸŽžƒˆ˜–—‘-„†-•…‰‹›€™]|[ÄÅ][\u0080-¿ŒœŠšŸŽž‘-„™]|â€|�/g;

export function mojibakeHits(f) {
  return lineTexts(f).flatMap((l) => [...l.matchAll(MOJIBAKE)].map((m) => l.slice(Math.max(0, m.index - 12), m.index + 14)));
}

/**
 * Old values from a stale-facts list. One entry per line: `label: old1 | old2` or just `old1 | old2`; `#` starts a
 * comment line. A JSON array of { label, old: [...] } works too. Inline settings separate entries with ";".
 */
export function parseStale(text = "") {
  const t = text.trim();
  if (!t) return [];
  if (/^[[{]/.test(t)) {
    const j = JSON.parse(t);
    const rows = Array.isArray(j) ? j : Object.entries(j).map(([label, old]) => ({ label, old }));
    return rows.map((r) => ({ label: r.label ?? r.key ?? "", values: [].concat(r.old ?? r.values ?? []).map(String).filter(Boolean) })).filter((r) => r.values.length);
  }
  return t
    .split(/\r?\n|;/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const m = l.match(/^([^:|]+?):\s+(.+)$/);
      const vals = (m ? m[2] : l).split("|").map((v) => v.trim()).filter(Boolean);
      return { label: m ? m[1].trim() : vals[0], values: vals };
    })
    .filter((r) => r.values.length);
}

// A line (or its section heading / table caption) about the past: an earlier year or history wording.
const HISTORY_RE = anyPhrase("history");
const HISTORY = { test: (s) => HISTORY_RE.test(fold(s)) };
const pastYear = (s, year) => [...s.matchAll(/(?<!\d)(19[5-9]\d|20\d\d)(?!\d)/g)].some((m) => Number(m[1]) < year);

/** Old values still on the page outside a past-year context: [label, value, line] rows. */
export function staleHits(f, stale, year = new Date().getFullYear()) {
  const out = [];
  const lines = f.lines ?? [];
  const res = stale.flatMap((s) => s.values.map((v) => [s.label, v, new RegExp(`(?<![\\p{L}\\p{N}])${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{N}]|[.,]\\p{N})`, "u")]));
  let heading = "";
  for (const l of lines) {
    if (l.heading) heading = l.text;
    for (const [label, v, re] of res) {
      if (!re.test(l.text)) continue;
      const ctx = `${heading} ${l.text}`;
      if (pastYear(ctx, year) || HISTORY.test(l.text)) continue;
      out.push([label, v, l.text.slice(0, 80)]);
    }
  }
  return out;
}

export default [
  {
    id: "placeholder-leak",
    severity: "error",
    tr: "Sayfada işlenmemiş kısa kod / şablon ya da JavaScript değeri görünüyor ({yil}, {{ad}}, ${x}, undefined, NaN, [object Object], lorem ipsum, TODO:). Kod örnekleri (pre/code), script ve JSON-LD sayılmaz",
    en: "Unrendered shortcode / template or leaked JavaScript value is visible ({year}, {{name}}, ${x}, undefined, NaN, [object Object], lorem ipsum, TODO:). Code samples (pre/code), scripts and JSON-LD are excluded",
    check: ({ pages, placeholders = [] }) =>
      [...pages].flatMap(([u, p]) => {
        if (!p.facts || p.fetch.status !== 200) return [];
        const hits = placeholderHits(p.facts, placeholders);
        return hits.length ? [finding(u, [...new Set(hits.map(([, s]) => s))].slice(0, 4).join(", "))] : [];
      }),
  },
  {
    id: "markdown-leak",
    severity: "warn",
    tr: "Ham Markdown ya da özel blok sözdizimi sayfaya çıkmış ([metin](adres), satır başında ##, ::: blokları, |---|, birden çok **kalın**): içerik hattında işlenmeden kalan parça var",
    en: "Raw Markdown or custom block syntax reached the page ([text](url), ## at line start, ::: blocks, |---|, several **bold**): part of the content pipeline did not render",
    check: ({ pages }) =>
      [...pages].flatMap(([u, p]) => {
        if (!p.facts || p.fetch.status !== 200) return [];
        const hits = markdownHits(p.facts);
        return hits.length ? [finding(u, `${hits.length}: ${hits.slice(0, 3).join(" · ")}`)] : [];
      }),
  },
  {
    id: "mojibake",
    severity: "error",
    tr: "Bozuk karakter (mojibake): UTF-8 metin Latin-1/Windows-1252 diye okunmuş (Ã¼, Ã§, Ä±, ÅŸ, â€™) ya da � var. Kaynak veri, veritabanı bağlantısı ya da dosya kodlamasını düzelt",
    en: "Mojibake: UTF-8 text decoded as Latin-1/Windows-1252 (Ã¼, Ã§, Ä±, ÅŸ, â€™) or � present. Fix the source data, database connection or file encoding",
    check: ({ pages }) =>
      [...pages].flatMap(([u, p]) => {
        if (!p.facts) return [];
        const hits = mojibakeHits(p.facts);
        return hits.length >= 2 ? [finding(u, `${hits.length}: ${hits.slice(0, 2).map((h) => `"${h}"`).join(", ")}`)] : [];
      }),
  },
  {
    id: "stale-fact",
    severity: "warn",
    tr: "Eskimiş değer hâlâ sayfada (listede verilen eski oran/tutar/tarih, geçmiş yıl bağlamı dışında). Liste --stale-file ya da ZORO_STALE_FILE / ZORO_STALE_VALUES ile verilir; liste yoksa kural çalışmaz",
    en: "An outdated value is still on the page (old rate/amount/date from the list, outside a past-year context). List via --stale-file or ZORO_STALE_FILE / ZORO_STALE_VALUES; silent without a list",
    check: ({ pages, stale = [] }) =>
      !stale.length
        ? []
        : [...pages].flatMap(([u, p]) => {
            if (!indexable(p)) return [];
            const hits = staleHits(p.facts, stale);
            return hits.length ? [finding(u, hits.slice(0, 3).map(([l, v, line]) => `${l === v ? "" : `${l}: `}${v} in "${line}"`).join("; "))] : [];
          }),
  },
  {
    id: "thin-content",
    severity: "info",
    tr: "Az metin (<250 kelime; araç, kategori ve iletişim sayfası için normal olabilir)",
    en: "Little text (<250 words; normal for tools, categories, contact)",
    check: ({ pages, start }) => [...pages].filter(([u, p]) => indexable(p) && u !== start && p.facts.wordCount < 250).map(([u, p]) => finding(u, `${p.facts.wordCount} words`)),
  },
  {
    id: "near-duplicate",
    severity: "warn",
    tr: "Neredeyse aynı içerik (%85+ benzer; birleştir ya da farklılaştır)",
    en: "Near-duplicate content (85%+ similar; merge or differentiate)",
    check: ({ pages }) => {
      const list = [...pages].filter(([, p]) => indexable(p) && p.facts.wordCount >= 150).slice(0, 400).map(([u, p]) => [u, shingles(p.facts.text)]);
      const out = [];
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const s = jaccard(list[i][1], list[j][1]);
          if (s >= 0.85) out.push(finding(list[i][0], `${Math.round(s * 100)}% ≈ ${list[j][0]}`));
        }
      return out;
    },
  },
  {
    id: "ai-cliches",
    severity: "info",
    tr: "Yapay zekâ kalıp ifadeleri yoğun (insan eliyle düzelt)",
    en: "Dense AI boilerplate phrasing (needs a human edit)",
    check: ({ pages }) =>
      [...pages].flatMap(([u, p]) => {
        if (!indexable(p) || p.facts.wordCount < 200) return [];
        const hits = clicheHits(p.facts.text, p.facts.lang);
        const total = hits.reduce((s, [, n]) => s + n, 0);
        const per1000 = (total / p.facts.wordCount) * 1000;
        return total >= 4 && per1000 >= 3 ? [finding(u, `${total} (${per1000.toFixed(1)}/1000 words): ${hits.slice(0, 4).map(([c, n]) => `${c}×${n}`).join(", ")}`)] : [];
      }),
  },
  {
    id: "freshness-missing",
    severity: "info",
    tr: "Dizine açık sayfaların bir kısmında hiç tarih sinyali yok (JSON-LD datePublished/dateModified, article:modified_time, <time>). Güncel bilgi içeren yazılarda tarih güven verir; araç, kategori ve yasal sayfalarda tarihsiz olmak normaldir",
    en: "Some indexable pages carry no date signal (JSON-LD datePublished/dateModified, article:modified_time, <time>). Dates help on time-sensitive articles; tools, categories and legal pages are fine without",
    site: true,
    check: ({ pages, start }) => {
      const idx = [...pages].filter(([, p]) => indexable(p));
      const miss = idx.filter(([, p]) => !hasDate(p.facts)).map(([u]) => u);
      if (!miss.length) return [];
      return [finding(start, `${miss.length}/${idx.length} (${Math.round((miss.length / idx.length) * 100)}%) e.g. ${miss.slice(0, 5).join(", ")}`)];
    },
  },
  {
    id: "citability",
    severity: "info",
    tr: "Alıntılanabilirlik: başlık altında çok uzun bölüm (400+ kelime), alt başlıksız uzun metin ya da 35+ kelimelik cümleler çok. Kısa, kendi başına anlaşılan paragraflar ve ara başlıklar yapay zekâ cevaplarında alıntılanmayı kolaylaştırır",
    en: "Citability: very long sections (400+ words under one heading), long text without sub-headings or many 35+ word sentences. Short self-contained passages under clear headings are easier for AI answers to quote",
    check: ({ pages, lang }) =>
      [...pages].flatMap(([u, p]) => {
        if (!indexable(p) || p.facts.wordCount < 300) return [];
        const issues = citability(p.facts, p.facts.lang ?? lang ?? "en");
        return issues.length ? [finding(u, issues.join("; "))] : [];
      }),
  },
];
