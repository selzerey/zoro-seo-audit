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

/** Main (or body) without scripts, nav, header and footer: the page's own content. */
function contentRoot(root) {
  const body = root.querySelector("main") ?? root.querySelector("body") ?? root;
  const clone = parse(body.toString());
  for (const el of clone.querySelectorAll(`${BLOCK_SKIP},nav,header,footer,[aria-hidden=true]`)) el.remove();
  return clone;
}

// structuredText breaks lines between block elements (textContent would glue "Title" + "First" into one word).
const flat = (el) => el.structuredText.replace(/\s+/g, " ").trim();

/** Visible text of an element (scripts and styles dropped). */
function visible(el) {
  const c = parse(el.toString());
  for (const x of c.querySelectorAll(BLOCK_SKIP)) x.remove();
  return flat(c);
}

/**
 * Prose split at headings: one row per section (heading text, level 1-6 or 0 before the first heading, word count) and
 * the paragraph-level text blocks. Tables, lists and forms are left out: they are data, not passages to quote.
 */
function prose(clone) {
  const c = parse(clone.toString());
  for (const el of c.querySelectorAll("table,ul,ol,dl,form,figure,pre,button,select,textarea")) el.remove();
  const sections = [];
  const blocks = [];
  for (const part of c.toString().split(/(?=<h[1-6][\s>])/i)) {
    const p = parse(part);
    const h = p.querySelector("h1,h2,h3,h4,h5,h6");
    const heading = h ? text(h) : null;
    const level = h ? Number(h.tagName[1]) : 0;
    h?.remove();
    const lines = p.structuredText.split(/\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    const n = lines.reduce((s, l) => s + words(l).length, 0);
    if (n || h) sections.push({ heading, level, words: n });
    blocks.push(...lines);
  }
  return { sections, blocks };
}

// Client-rendered app roots (React, Next pages router, Vue, Nuxt, Gatsby, SvelteKit). "Empty" = under 50 visible chars
// (limit from seomator-geo-audit thresholds.json, Copyright (c) 2026 SEOmator — MIT, THIRD_PARTY_NOTICES.md).
const APP_ROOTS = ["root", "__next", "app", "__nuxt", "___gatsby", "svelte"];

/** Raw-HTML shape for content extractability: an empty app root and little visible text = content needs JS. */
function shell(root) {
  const body = root.querySelector("body") ?? root;
  const emptyRoot = APP_ROOTS.find((id) => {
    const el = root.getElementById?.(id);
    return el && visible(el).length < 50;
  });
  return {
    emptyRoot: emptyRoot ?? null,
    hasMain: !!root.querySelector('main,[role="main"]'),
    chars: visible(body).length,
    scripts: root.querySelectorAll("script[src]").length,
  };
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

  const clone = contentRoot(root);
  const body = flat(clone);
  const rel = (l, re) => re.test(l.getAttribute("rel") ?? "");
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
    twitterCard: meta("twitter:card") ?? prop("twitter:card"),
    // RSS/Atom feeds declared in <head>.
    feeds: root
      .querySelectorAll("link")
      .filter((l) => rel(l, /(^|\s)alternate(\s|$)/i) && /application\/(rss|atom)\+xml/i.test(l.getAttribute("type") ?? ""))
      .map((l) => absolute(l.getAttribute("href") ?? "", base))
      .filter(Boolean),
    // Date signals outside JSON-LD: Open Graph article times and <time> elements.
    metaDates: ["article:modified_time", "article:published_time", "og:updated_time"].map(prop).filter(Boolean),
    timeCount: root.querySelectorAll("time").length,
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
    ...prose(clone),
    shell: shell(root),
    htmlBytes: Buffer.byteLength(html),
  };
}
