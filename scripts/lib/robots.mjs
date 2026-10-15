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
