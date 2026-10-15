// Loads settings. Order (first wins): process.env > ~/.claude/skills/zoro-seo-audit/.env > ~/.claude/skills/.env
// > ~/.claude/.env > ./.claude/skills/zoro-seo-audit/.env > ./.claude/skills/.env > ./.claude/.env
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SKILL = "zoro-seo-audit";

export function envFiles(home = os.homedir(), cwd = process.cwd()) {
  return [
    path.join(home, ".claude", "skills", SKILL, ".env"),
    path.join(home, ".claude", "skills", ".env"),
    path.join(home, ".claude", ".env"),
    path.join(cwd, ".claude", "skills", SKILL, ".env"),
    path.join(cwd, ".claude", "skills", ".env"),
    path.join(cwd, ".claude", ".env"),
  ];
}

export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    out[m[1]] = v;
  }
  return out;
}

/** Merged settings; process.env always wins, then files in the documented order. */
export function loadEnv({ files = envFiles(), base = process.env } = {}) {
  const merged = {};
  for (const f of [...files].reverse()) {
    try {
      Object.assign(merged, parseEnv(fs.readFileSync(f, "utf8")));
    } catch {
      /* missing file is fine */
    }
  }
  for (const [k, v] of Object.entries(base)) if (v !== undefined && v !== "") merged[k] = v;
  return merged;
}
