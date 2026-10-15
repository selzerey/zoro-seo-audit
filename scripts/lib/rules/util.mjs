// Shared helpers for rules.
export const noindex = (f) => /(^|[\s,])(noindex|none)([\s,]|$)/.test(`${f.robots} ${f.googlebot}`);

export function xRobotsNoindex(headers = {}) {
  return /(^|[\s,:])(noindex|none)([\s,]|$)/i.test(headers["x-robots-tag"] ?? "");
}

export function canonicalOf(page) {
  const f = page.facts;
  if (!f || f.canonicals.length !== 1) return null;
  try {
    return new URL(f.canonicals[0], f.url).href;
  } catch {
    return null;
  }
}

/** Page Google may index: 200 HTML, no noindex, canonical missing or pointing at itself. */
export function indexable(page) {
  const f = page.facts;
  if (!f || page.fetch.status !== 200) return false;
  if (noindex(f) || xRobotsNoindex(page.fetch.headers)) return false;
  const c = canonicalOf(page);
  return !c || c === f.url;
}

/** Rough SERP pixel width of a title/description at Google's desktop font (Arial-like, 20px / 14px). */
const NARROW = /[ilIjtf.,;:!'|()[\]ıİ ]/;
const WIDE = /[mwMWĞŞÖÜÇ@%]/;
export function pixelWidth(s, size = 20) {
  let w = 0;
  for (const ch of s) w += NARROW.test(ch) ? 0.3 : WIDE.test(ch) ? 0.85 : /[A-ZĞÜŞİÖÇ0-9]/.test(ch) ? 0.66 : 0.52;
  return Math.round(w * size);
}

export function finding(url, detail = "") {
  return { url, detail: String(detail) };
}
