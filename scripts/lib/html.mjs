// Turns one HTML document into plain facts the rules read. No rule logic here.
import { parse } from "node-html-parser";

const BLOCK_SKIP = "script,style,noscript,template,svg";

export function absolute(href, base) {
  try {
    const u = new URL(href, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}

function text(el) {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function words(s) {
  return s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
}

/** Body text without scripts, nav, header and footer: the page's own content. */
function mainText(root) {
  const body = root.querySelector("main") ?? root.querySelector("body") ?? root;
  const clone = parse(body.toString());
  for (const el of clone.querySelectorAll(`${BLOCK_SKIP},nav,header,footer,[aria-hidden=true]`)) el.remove();
  // structuredText breaks lines between block elements (textContent would glue "Title" + "First" into one word).
  return clone.structuredText.replace(/\s+/g, " ").trim();
}

export function extract(html, url) {
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: true, noscript: true } });
  const head = root.querySelector("head") ?? root;
  const metas = root.querySelectorAll("meta");
  const meta = (name) => metas.find((m) => (m.getAttribute("name") ?? "").toLowerCase() === name)?.getAttribute("content") ?? null;
  const prop = (name) => metas.find((m) => (m.getAttribute("property") ?? "").toLowerCase() === name)?.getAttribute("content") ?? null;
  const base = absolute(root.querySelector("base")?.getAttribute("href") ?? "", url) ?? url;

  const canonicals = root
    .querySelectorAll("link")
    .filter((l) => (l.getAttribute("rel") ?? "").toLowerCase().split(/\s+/).includes("canonical"))
    .map((l) => l.getAttribute("href") ?? "");

  // Favicon candidates (rel="icon", "shortcut icon", "apple-touch-icon"); Google shows one next to results.
  const icons = root
    .querySelectorAll("link")
    .filter((l) => /(^|\s)(icon|apple-touch-icon)(\s|$)/i.test(l.getAttribute("rel") ?? ""))
    .map((l) => absolute(l.getAttribute("href") ?? "", base))
    .filter(Boolean);

  const hreflang = root
    .querySelectorAll("link[hreflang]")
    .map((l) => ({ lang: (l.getAttribute("hreflang") ?? "").toLowerCase(), href: absolute(l.getAttribute("href") ?? "", base) }));

  const links = root.querySelectorAll("a[href]").map((a) => {
    const raw = a.getAttribute("href") ?? "";
    const rel = (a.getAttribute("rel") ?? "").toLowerCase();
    const label = text(a) || a.getAttribute("aria-label") || a.getAttribute("title") || a.querySelector("img")?.getAttribute("alt") || "";
    return { raw, href: absolute(raw, base), nofollow: rel.includes("nofollow"), label: label.trim(), inChrome: !!a.closest("nav,header,footer") };
  });

  const firstH2 = root.querySelector("h2")?.range[0] ?? null;
  const images = root.querySelectorAll("img").map((img, i) => ({
    index: i,
    src: img.getAttribute("src") ?? img.getAttribute("data-src") ?? "",
    hasAlt: img.hasAttribute("alt"),
    alt: img.getAttribute("alt") ?? "",
    width: img.getAttribute("width"),
    height: img.getAttribute("height"),
    loading: (img.getAttribute("loading") ?? "").toLowerCase(),
    fetchpriority: (img.getAttribute("fetchpriority") ?? "").toLowerCase(),
    // Above the first h2 = likely in the first screen (hero / LCP candidate).
    beforeFirstH2: firstH2 === null || img.range[0] < firstH2,
  }));

  const jsonLd = root.querySelectorAll('script[type="application/ld+json"]').map((s) => {
    const raw = s.textContent ?? s.innerHTML;
    try {
      return { ok: true, data: JSON.parse(raw) };
    } catch (e) {
      return { ok: false, error: String(e.message).slice(0, 120) };
    }
  });

  const body = mainText(root);
  return {
    url,
    lang: root.querySelector("html")?.getAttribute("lang") ?? null,
    // Browsers use the first <title> anywhere in the document (streamed React pages may put it in <body>).
    title: text(head.querySelector("title")) || text(root.querySelector("title")),
    titleCount: root.querySelectorAll("title").length,
    description: meta("description"),
    robots: (meta("robots") ?? "").toLowerCase(),
    googlebot: (meta("googlebot") ?? "").toLowerCase(),
    ogImage: prop("og:image"),
    ogTitle: prop("og:title"),
    siteName: prop("og:site_name"),
    icons,
    canonicals,
    hreflang,
    h1: root.querySelectorAll("h1").map(text),
    headings: root.querySelectorAll("h2,h3").map(text),
    links,
    images,
    jsonLd,
    // Only resources the browser loads count; a plain <a href="http://..."> is not mixed content.
    mixedContent: url.startsWith("https:")
      ? [
          ...root.querySelectorAll("img[src],script[src],iframe[src],source[src],video[src],audio[src]").map((e) => e.getAttribute("src")),
          ...root.querySelectorAll('link[rel="stylesheet"][href]').map((e) => e.getAttribute("href")),
        ].filter((u) => /^http:\/\//i.test(u ?? ""))
      : [],
    text: body,
    wordCount: words(body).length,
    htmlBytes: Buffer.byteLength(html),
  };
}
