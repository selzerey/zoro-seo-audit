// Content: thin pages, near-duplicates, AI boilerplate phrases (Turkish + English).
import { words } from "../html.mjs";
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
];
