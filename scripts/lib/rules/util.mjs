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

/** Most common day when ≥ `share` of the dates fall on it (≥ `min` dates): stamped at build or request time. */
export function uniformDay(dates, { min = 20, share = 0.9 } = {}) {
  if (dates.length < min) return null;
  const days = new Map();
  for (const d of dates) days.set(d, (days.get(d) ?? 0) + 1);
  const [day, n] = [...days].sort((a, b) => b[1] - a[1])[0];
  return n / dates.length >= share ? { day, n, of: dates.length } : null;
}

// Robots directives that carry a value after a colon (so "max-snippet:0" is not read as a user-agent prefix).
const VALUED = /^(max-snippet|max-image-preview|max-video-preview|unavailable_after)$/;

/** X-Robots-Tag directives that apply to Googlebot: unprefixed ones and those after "googlebot:". */
export function headerDirectives(value = "") {
  const out = [];
  let ua = null;
  for (const raw of value.toLowerCase().split(",")) {
    let part = raw.trim();
    const m = part.match(/^([a-z0-9_-]+)\s*:\s*(.*)$/);
    if (m && !VALUED.test(m[1])) {
      ua = m[1];
      part = m[2].trim();
    }
    if (part && (!ua || ua === "googlebot")) out.push(part.replace(/\s*:\s*/, ":"));
  }
  return out;
}

/** Every robots instruction source of a page: each meta robots/googlebot tag and the X-Robots-Tag header. */
export function robotsSources(page) {
  const list = (s) => s.split(",").map((x) => x.trim().replace(/\s*:\s*/, ":")).filter(Boolean);
  const out = (page.facts?.robotsMetas ?? []).map((m) => ({ src: `meta ${m.name}`, list: list(m.content) }));
  const h = headerDirectives(page.fetch.headers?.["x-robots-tag"] ?? "");
  if (h.length) out.push({ src: "X-Robots-Tag", list: h });
  return out;
}
