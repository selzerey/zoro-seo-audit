// Turns one HTML document into plain facts the rules read. No rule logic here.
import { parse } from "./vendor/node-html-parser.mjs";
import { words } from "./lang.mjs";

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

export { words };

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

// Elements the HTML parser accepts inside <head>; anything else (or text) ends the head there.
const HEAD_OK = new Set(["title", "meta", "link", "script", "style", "base", "noscript", "template"]);
const RAW_TEXT = new Set(["script", "style", "title", "textarea", "template"]);

function attrs(s) {
  const out = {};
  for (const m of s.matchAll(/([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

/** Tags that steer indexing: lost when the parser has already closed <head> before them. */
function critical(name, a) {
  const rel = (a.rel ?? "").toLowerCase().split(/\s+/);
  if (name === "link" && rel.includes("canonical")) return "canonical";
  if (name === "link" && a.hreflang) return `hreflang ${a.hreflang}`;
  if (name === "meta" && /^(robots|googlebot|description)$/i.test(a.name ?? "")) return `meta ${a.name.toLowerCase()}`;
  if (name === "title") return "title";
  return null;
}

/**
 * Raw-HTML walk of <head> the way a browser (and Googlebot) parses it: the first element not allowed in <head>
 * (div, img, iframe, p, stray text, or a <noscript> holding more than link/style/meta) closes the head, and every
 * canonical / robots / hreflang / description after it lands in <body> and is ignored. DOM libraries keep such tags
 * where they were written, so this works on the source text. Also counts canonicals written inside <body>.
 */
export function headScan(html) {
  const re = /<!--[\s\S]*?-->|<![^>]*>|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  const out = { invalid: null, lost: [], bodyCanonicals: 0 };
  let state = "before"; // before | head | broken (closed early by an invalid element) | after | body
  let last = 0;
  let m;
  while ((m = re.exec(html))) {
    const between = html.slice(last, m.index);
    last = re.lastIndex;
    if (state === "head" && /\S/.test(between)) {
      out.invalid = `text "${between.trim().slice(0, 30)}"`;
      state = "broken";
    }
    if (!m[2]) continue; // comment, doctype
    const name = m[2].toLowerCase();
    const closing = m[1] === "/";
    const a = closing ? {} : attrs(m[3]);
    const skipTo = (tag) => {
      const close = new RegExp(`</${tag}`, "gi");
      close.lastIndex = re.lastIndex;
      const end = close.exec(html)?.index ?? -1;
      const inner = html.slice(re.lastIndex, end < 0 ? html.length : end);
      re.lastIndex = last = end < 0 ? html.length : end;
      return inner;
    };
    if (state === "before" && name === "head" && !closing) state = "head";
    else if (name === "body" && !closing) state = "body";
    else if (name === "head" && closing) state = state === "broken" ? "body" : state === "head" ? "after" : state;
    else if (state === "head" && !closing && name === "noscript") {
      const bad = [...skipTo("noscript").matchAll(/<([a-zA-Z][\w-]*)/g)].map((x) => x[1].toLowerCase()).find((t) => !["link", "style", "meta"].includes(t));
      if (bad) {
        out.invalid = `<noscript><${bad}>`;
        state = "broken";
      }
      continue;
    } else if (state === "head" && !closing && !HEAD_OK.has(name) && name !== "html") {
      out.invalid = `<${name}>`;
      state = "broken";
    }
    if (closing) continue;
    const c = critical(name, a);
    if (c && state === "broken") out.lost.push(c);
    if (c === "canonical" && (state === "body" || state === "after")) out.bodyCanonicals++;
    if (RAW_TEXT.has(name)) skipTo(name);
  }
  return out;
}

const LEAK_SKIP = `${BLOCK_SKIP},code,pre,kbd,samp,var,textarea,del,s,[hidden]`;

/**
 * Visible text lines of the whole body (nav and footer included: a leak there is as visible), without code samples,
 * scripts, JSON-LD, struck-through text and hidden elements. A table row is one line ("2025 ¦ 17.002,12") so a value
 * keeps its year next to it; headings and captions carry `heading: true` for context lookups.
 */
function visibleLines(root) {
  const body = parse((root.querySelector("body") ?? root).toString());
  for (const el of body.querySelectorAll(LEAK_SKIP)) el.remove();
  for (const tr of body.querySelectorAll("tr")) tr.replaceWith(`<p>${tr.querySelectorAll("td,th").map(text).join(" ¦ ")}</p>`);
  for (const h of body.querySelectorAll("h1,h2,h3,h4,h5,h6,caption")) h.set_content(`${h.innerHTML}`);
  return body.structuredText
    .split(/\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .map((l) => (l.startsWith("") ? { text: l.slice(1).trim(), heading: true } : { text: l, heading: false }))
    .filter((l) => l.text);
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
  const iconLinks = root.querySelectorAll("link").filter((l) => /(^|\s)(icon|apple-touch-icon)(\s|$)/i.test(l.getAttribute("rel") ?? ""));
  const icons = iconLinks.map((l) => absolute(l.getAttribute("href") ?? "", base)).filter(Boolean);
  // Inline data: icons show in browsers, but Google needs a crawlable file URL for the result favicon.
  const inlineIcons = iconLinks.filter((l) => /^\s*data:/i.test(l.getAttribute("href") ?? "")).length;

  const hreflang = root
    .querySelectorAll("link[hreflang]")
    .map((l) => ({ lang: (l.getAttribute("hreflang") ?? "").toLowerCase(), href: absolute(l.getAttribute("href") ?? "", base) }));

  const links = root.querySelectorAll("a[href]").map((a) => {
    const raw = a.getAttribute("href") ?? "";
    const rel = (a.getAttribute("rel") ?? "").toLowerCase();
    const label = text(a) || a.getAttribute("aria-label") || a.getAttribute("title") || a.querySelector("img")?.getAttribute("alt") || "";
    return { raw, href: absolute(raw, base), nofollow: rel.includes("nofollow"), label: label.trim(), inChrome: !!a.closest("nav,header,footer,aside") };
  });

  // Navigation Google cannot follow: <a> without a real href but with an onclick, javascript: hrefs that navigate,
  // and onclick handlers on other elements that change location. Buttons that open menus or tabs are not navigation.
  const NAV_JS = /location|window\.open|navigate|router\.push/i;
  const jsLinks = [
    ...root.querySelectorAll("a").filter((a) => {
      const h = (a.getAttribute("href") ?? "").trim();
      const fake = !a.hasAttribute("href") || h === "" || h === "#" || /^javascript:/i.test(h);
      return fake && (a.hasAttribute("onclick") || (/^javascript:/i.test(h) && NAV_JS.test(h)));
    }),
    ...root.querySelectorAll("[onclick]").filter((el) => el.tagName !== "A" && NAV_JS.test(el.getAttribute("onclick"))),
  ].map((el) => `<${el.tagName.toLowerCase()}${el.hasAttribute("href") ? ` href="${el.getAttribute("href")}"` : ""} onclick> ${text(el).slice(0, 30)}`);

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
  const inCode = (el) => !!el.closest("pre,code");
  // Absolute addresses the page points at (links, assets, canonical, og, JSON-LD strings): dev-host leaks.
  const refs = new Set();
  for (const [sel, at] of [["a", "href"], ["link", "href"], ["img", "src"], ["script", "src"], ["iframe", "src"], ["source", "src"], ["form", "action"]])
    for (const el of root.querySelectorAll(`${sel}[${at}]`)) if (!inCode(el)) refs.add(el.getAttribute(at).trim());
  for (const m of metas) if (/^og:(url|image)$/i.test(m.getAttribute("property") ?? "")) refs.add((m.getAttribute("content") ?? "").trim());
  for (const j of jsonLd) if (j.ok) JSON.stringify(j.data).replace(/"((?:https?|file):\/\/[^"]+)"/g, (_, v) => refs.add(v));
  const nosnippet = clone.querySelectorAll("[data-nosnippet]").filter((el) => !el.parentNode?.closest?.("[data-nosnippet]"));
  const rel = (l, re) => re.test(l.getAttribute("rel") ?? "");
  return {
    url,
    lang: root.querySelector("html")?.getAttribute("lang") ?? null,
    // Browsers use the first <title> anywhere in the document (streamed React pages may put it in <body>).
    title: text(head.querySelector("title")) || text(root.querySelector("title")),
    titleCount: root.querySelectorAll("title").length,
    // <title> outside inline SVG (an SVG <title> is the icon's tooltip, not the page title).
    pageTitles: root.querySelectorAll("title").filter((t) => !t.closest("svg")).length,
    descriptionCount: metas.filter((m) => (m.getAttribute("name") ?? "").toLowerCase() === "description").length,
    robotsMetas: metas
      .filter((m) => /^(robots|googlebot)$/i.test(m.getAttribute("name") ?? ""))
      .map((m) => ({ name: m.getAttribute("name").toLowerCase(), content: (m.getAttribute("content") ?? "").toLowerCase() })),
    viewports: metas.filter((m) => (m.getAttribute("name") ?? "").toLowerCase() === "viewport").map((m) => m.getAttribute("content") ?? ""),
    // <meta charset> (or http-equiv Content-Type with charset) within the first 1024 bytes, later, or absent.
    charset: /<meta[^>]+charset\s*=/i.test(Buffer.from(html).subarray(0, 1024).toString("latin1")) ? "early" : /<meta[^>]+charset\s*=/i.test(html) ? "late" : null,
    ogUrl: prop("og:url"),
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
    inlineIcons,
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
    lines: visibleLines(root),
    head: headScan(html),
    // Only absolute forms can leak another host (relative URLs resolve to the page's own host).
    refs: [...refs].filter((r) => /^(?:[a-z][\w+.-]*:|\/\/|\\\\|[a-z]:\\)/i.test(r)).slice(0, 300),
    jsLinks,
    // Same-host assets the page loads (robots.txt must let Googlebot fetch them to render the page).
    resources: [
      ...new Set(
        [
          ...root.querySelectorAll("script[src]").map((e) => e.getAttribute("src")),
          ...root.querySelectorAll("img[src]").map((e) => e.getAttribute("src")),
          ...root.querySelectorAll("link[href]").filter((l) => rel(l, /(^|\s)(stylesheet|preload|modulepreload)(\s|$)/i)).map((l) => l.getAttribute("href")),
        ]
          .map((s) => absolute(s ?? "", base))
          .filter((s) => s && new URL(s).host === new URL(url).host),
      ),
    ].slice(0, 200),
    // Characters of the page's own text inside data-nosnippet (hidden from snippets and AI Overviews).
    nosnippetChars: nosnippet.reduce((n, el) => n + flat(el).length, 0),
    ...prose(clone),
    shell: shell(root),
    htmlBytes: Buffer.byteLength(html),
  };
}
