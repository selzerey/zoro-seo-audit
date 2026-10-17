// robots.txt parsing per RFC 9309: group match by user-agent, longest path wins, Allow wins ties.
export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "sitemap") {
      if (val) sitemaps.push(val);
      continue;
    }
    if (key === "user-agent") {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "allow" || key === "disallow") current.rules.push({ allow: key === "allow", path: val });
  }
  return { groups, sitemaps };
}

function groupFor(robots, agent) {
  const a = agent.toLowerCase();
  const named = robots.groups.filter((g) => g.agents.some((x) => x !== "*" && a.includes(x)));
  if (named.length) return named.flatMap((g) => g.rules);
  return robots.groups.filter((g) => g.agents.includes("*")).flatMap((g) => g.rules);
}

function toRegex(p) {
  const anchored = p.endsWith("$");
  const body = (anchored ? p.slice(0, -1) : p).replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + body + (anchored ? "$" : ""));
}

/** true when `agent` may fetch `url`. Empty Disallow allows everything. */
export function isAllowed(robots, agent, url) {
  const u = new URL(url);
  const target = u.pathname + u.search;
  let best = null;
  for (const r of groupFor(robots, agent)) {
    if (!r.path) continue;
    if (!toRegex(r.path).test(target)) continue;
    const len = r.path.length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
  }
  return best ? best.allow : true;
}

/** AI and search crawlers worth knowing about (2026). Search vs. training is the useful split. */
export const BOTS = [
  { ua: "Googlebot", kind: "search" },
  { ua: "Bingbot", kind: "search" },
  { ua: "YandexBot", kind: "search" },
  { ua: "OAI-SearchBot", kind: "ai-search" },
  { ua: "ChatGPT-User", kind: "ai-user" },
  { ua: "GPTBot", kind: "ai-training" },
  { ua: "Claude-SearchBot", kind: "ai-search" },
  { ua: "Claude-User", kind: "ai-user" },
  { ua: "ClaudeBot", kind: "ai-training" },
  { ua: "PerplexityBot", kind: "ai-search" },
  { ua: "Google-Extended", kind: "ai-training" },
  { ua: "Applebot-Extended", kind: "ai-training" },
  { ua: "CCBot", kind: "ai-training" },
];

// Directives search engines document; Content-Signal (Cloudflare) and Content-Usage (IETF draft) are known extensions.
const KNOWN = new Set(["user-agent", "allow", "disallow", "sitemap", "crawl-delay", "host", "clean-param", "content-signal", "content-usage", "request-rate", "visit-time"]);

/**
 * Problems a robots.txt parser trips on: HTML served instead of text, size over Google's 500 KiB limit, lines that
 * are not `key: value`, unknown keys (`noindex:` in robots.txt is ignored since 2019), rules before any User-agent
 * and relative Sitemap URLs. Comments and blank lines are fine.
 */
export function robotsSyntax(text, { type = "", bytes = Buffer.byteLength(text) } = {}) {
  const out = [];
  if (/html/i.test(type) || /^\s*<(!doctype|html)/i.test(text)) return ["served as HTML, not a robots.txt"];
  if (bytes > 500 * 1024) out.push(`${Math.round(bytes / 1024)} KiB: Google reads only the first 500 KiB`);
  let seenAgent = false;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/^﻿/, "").replace(/#.*$/, "").trim();
    if (!line) return;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) return out.push(`line ${i + 1}: not "key: value" (${line.slice(0, 40)})`);
    const key = m[1].toLowerCase();
    if (!KNOWN.has(key)) out.push(`line ${i + 1}: unknown directive "${m[1]}"${key === "noindex" ? " (not supported in robots.txt)" : ""}`);
    if (key === "user-agent") seenAgent = true;
    else if ((key === "allow" || key === "disallow") && !seenAgent) out.push(`line ${i + 1}: ${m[1]} before any User-agent (ignored)`);
    else if (key === "sitemap" && m[2] && !/^https?:\/\//i.test(m[2].trim())) out.push(`line ${i + 1}: Sitemap must be an absolute URL`);
  });
  return out;
}

/** Content-Signal lines (`search=yes, ai-input=no, ai-train=no`) merged, and whether Cloudflare manages the file. */
export function contentSignals(text) {
  const signals = {};
  for (const m of text.matchAll(/^\s*content-signal\s*:\s*(.+)$/gim))
    for (const part of m[1].replace(/#.*$/, "").split(",")) {
      const [k, v] = part.split("=").map((s) => s?.trim().toLowerCase());
      if (k && v) signals[k] = v;
    }
  return { signals, managed: /BEGIN Cloudflare Managed/i.test(text) };
}
