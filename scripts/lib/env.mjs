// Loads settings (API keys and options). First file that sets a key wins; process.env always wins over files.
//   1. $ZORO_SEO_AUDIT_ENV (an explicit file)
//   2. ./.zoro-seo-audit.env                         (this project only)
//   3. ~/.config/zoro-seo-audit/.env                 (recommended: written by `zoro-seo-audit setup`, survives updates)
//   4. <skill folder>/.env                           (next to SKILL.md, wherever the skill is installed)
//   5. ~/.claude/skills/zoro-seo-audit/.env, ~/.agents/skills/zoro-seo-audit/.env, ~/.claude/skills/.env, ~/.claude/.env
//   6. ./.claude/skills/zoro-seo-audit/.env, ./.agents/skills/zoro-seo-audit/.env, ./.claude/skills/.env, ./.claude/.env
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL = "zoro-seo-audit";
/** Root of this skill/package (the folder with SKILL.md). */
export const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** ~/.config/zoro-seo-audit (or $XDG_CONFIG_HOME/zoro-seo-audit) on every OS. */
export function configDir(home = os.homedir(), env = process.env) {
  return path.join(env.XDG_CONFIG_HOME || path.join(home, ".config"), SKILL);
}

export function envFiles(home = os.homedir(), cwd = process.cwd(), env = process.env) {
  return [
    env.ZORO_SEO_AUDIT_ENV,
    path.join(cwd, ".zoro-seo-audit.env"),
    path.join(configDir(home, env), ".env"),
    path.join(SKILL_ROOT, ".env"),
    path.join(home, ".claude", "skills", SKILL, ".env"),
    path.join(home, ".agents", "skills", SKILL, ".env"),
    path.join(home, ".claude", "skills", ".env"),
    path.join(home, ".claude", ".env"),
    path.join(cwd, ".claude", "skills", SKILL, ".env"),
    path.join(cwd, ".agents", "skills", SKILL, ".env"),
    path.join(cwd, ".claude", "skills", ".env"),
    path.join(cwd, ".claude", ".env"),
  ].filter(Boolean);
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

/** Settings files that exist, in priority order. */
export const foundEnvFiles = (files = envFiles()) => [...new Set(files)].filter((f) => fs.existsSync(f));

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
