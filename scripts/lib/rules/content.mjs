// Content: thin pages, near-duplicates, AI boilerplate phrases (Turkish + English), date signals, citability.
// Citability limits (400-word sections, 35-word sentences) adapted from seomator-geo-audit thresholds.json,
// Copyright (c) 2026 SEOmator — MIT License (THIRD_PARTY_NOTICES.md).
import { words } from "../html.mjs";
import { nodes } from "./schema.mjs";
import { finding, indexable } from "./util.mjs";

/** Phrases that mark mass-produced AI text. Count is a hint for a human edit, not a penalty score. */
export const CLICHES = [
  // Turkish
  "günümüzde", "günümüz dünyasında", "hızla değişen", "sonuç olarak", "özetle", "unutmamak gerekir ki", "unutulmamalıdır ki",
  "önemle belirtmek gerekir", "bu yazımızda", "bu makalede", "detaylı bir şekilde", "kapsamlı bir rehber", "hayati önem taşır",
  "büyük önem taşımaktadır", "göz önünde bulundurulmalıdır", "son derece önemlidir", "dikkat edilmesi gereken", "merak edilen",
  "sizler için", "yolculuğunuzda", "dünyasına", "kilit rol oynar", "ayrılmaz bir parçası", "vazgeçilmez",
  // English
  "in today's fast-paced", "in today's world", "delve into", "it is important to note", "in conclusion", "navigating the",
  "a testament to", "plays a crucial role", "unlock the", "seamless", "embark on", "ever-evolving", "comprehensive guide",
];

export function clicheHits(text) {
  const t = text.toLocaleLowerCase("tr");
  const hits = [];
  for (const c of CLICHES) {
    const n = t.split(c).length - 1;
    if (n) hits.push([c, n]);
  }
  return hits.sort((a, b) => b[1] - a[1]);
}

function shingles(text, k = 5) {
  const w = words(text.toLocaleLowerCase("tr"));
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

// Abbreviations whose period does not end a sentence (lower-case, without the final dot).
const ABBR = {
  tr: ["ör", "örn", "vb", "vs", "bkz", "bk", "krş", "dr", "prof", "doç", "yrd", "av", "op", "hz", "yy", "sn", "no", "md", "mad", "s", "sf", "c", "t.c", "m.ö", "m.s", "çev", "haz", "yay", "cad", "sok", "mah", "apt", "tel", "st"],
  en: ["e.g", "i.e", "mr", "mrs", "ms", "dr", "prof", "st", "vs", "etc", "no", "fig", "approx", "inc", "ltd", "jr", "sr", "vol", "pp", "cf"],
};

/**
 * Sentences of one text block. A period is not a sentence end after a known abbreviation, a single capital initial
 * ("A. Yılmaz"), or when the next word starts lower-case ("3. sınıf", "vb. gibi"). Decimal points never match.
 */
export function sentences(text, lang = "tr") {
  const l = /^tr/i.test(lang ?? "") ? "tr" : "en";
  const abbr = new Set(ABBR[l]);
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

export default [
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
        const hits = clicheHits(p.facts.text);
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
        const issues = citability(p.facts, p.facts.lang ?? lang ?? "tr");
        return issues.length ? [finding(u, issues.join("; "))] : [];
      }),
  },
];
