#!/usr/bin/env node
// zoro-seo-audit command line: audit a site, run the Search Console / Bing / IndexNow tools, install the skill
// for Claude Code and Codex, and write API settings. `npx zoro-seo-audit help` lists everything.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { isMain } from "../scripts/lib/args.mjs";
import { configDir, envFiles, foundEnvFiles, loadEnv, parseEnv, SKILL, SKILL_ROOT } from "../scripts/lib/env.mjs";

const VERSION = JSON.parse(fs.readFileSync(path.join(SKILL_ROOT, "package.json"), "utf8")).version;

const HELP = `zoro-seo-audit ${VERSION} — low-noise SEO audit for any website

Usage
  zoro-seo-audit <url> [options]          Crawl a site and print a report (same as "audit <url>")
  zoro-seo-audit install [targets]        Install the skill for Claude Code and/or Codex
  zoro-seo-audit uninstall [targets]      Remove the installed skill
  zoro-seo-audit setup                    Save Search Console / Bing / IndexNow keys (optional)
  zoro-seo-audit doctor                   Show what is installed and which settings are found
  zoro-seo-audit gsc <command>            Search Console reports      (gsc help)
  zoro-seo-audit bing <command>           Bing Webmaster reports      (bing help)
  zoro-seo-audit indexnow <command>       Submit URLs with IndexNow   (indexnow help)
  zoro-seo-audit google-auth --client <client.json> --out <token.json>

Audit options
  --max 50              pages to crawl            --format md|json      report format
  --out report.md       write to a file           --lang en|tr          report language (default en)
  --only id,category    run only these rules      --skip id,id          skip rules
  --concurrency 4       parallel requests         --delay 100           pause per request (ms)
  --check-links 300     link targets to check     --ua "..."            user agent
  --stale-file f.txt    old values to find        --placeholders a,b    shortcode names to find
  --dev-hosts a,b       preview hosts             --quiet               no progress output

Install targets (default: every agent found on this computer)
  --claude              ~/.claude/skills/${SKILL}
  --codex               ~/.agents/skills/${SKILL}
  --project             install into ./.claude/skills and ./.agents/skills of this folder instead
  --force               replace a folder that is a git clone

Examples
  npx zoro-seo-audit https://example.com/ --max 100 --out audit.md
  npx zoro-seo-audit install
  npx zoro-seo-audit gsc report --site sc-domain:example.com --out gsc.md
`;

// Files and folders that make up the installed skill.
const SKILL_FILES = ["SKILL.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "package.json", "agents", "cli", "references", "scripts"];
const SKIP = new Set(["tests", "node_modules", ".env"]);

function targets(flags, home = os.homedir(), cwd = process.cwd()) {
  const root = flags.project ? cwd : home;
  const all = { claude: path.join(root, ".claude", "skills", SKILL), codex: path.join(root, ".agents", "skills", SKILL) };
  let pick = ["claude", "codex"].filter((k) => flags[k]);
  if (!pick.length) {
    pick = flags.project ? ["claude", "codex"] : ["claude", "codex"].filter((k) => fs.existsSync(path.join(home, k === "claude" ? ".claude" : ".codex")) || fs.existsSync(path.join(home, k === "claude" ? ".claude" : ".agents")));
    if (!pick.length) pick = ["claude", "codex"];
  }
  return pick.map((k) => [k, all[k]]);
}

const isLink = (p) => {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};
const real = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};
const same = (a, b) => real(a).toLowerCase() === real(b).toLowerCase();

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

/** Copies the skill into each target. A .env inside an old install is kept. Returns [agent, dir] pairs. */
export function install(flags = {}, { home, cwd, from = SKILL_ROOT, log = console.log } = {}) {
  const done = [];
  for (const [agent, dir] of targets(flags, home, cwd)) {
    // A symlink/junction (e.g. to a git clone) is never followed: it is left alone or, with --force, only unlinked.
    if (isLink(dir)) {
      if (!flags.force || same(dir, from)) {
        log(`${agent}: ${dir} is a link to ${real(dir)} — ${same(dir, from) ? "already this copy" : "update that folder, or pass --force to replace the link"}`);
        continue;
      }
      fs.unlinkSync(dir);
    }
    if (fs.existsSync(dir) && same(dir, from)) {
      log(`${agent}: already running from ${dir}`);
      continue;
    }
    if (fs.existsSync(path.join(dir, ".git")) && !flags.force) {
      log(`${agent}: ${dir} is a git clone — update it with "git pull" (or pass --force to replace it)`);
      continue;
    }
    const keep = fs.existsSync(path.join(dir, ".env")) ? fs.readFileSync(path.join(dir, ".env")) : null;
    fs.rmSync(dir, { recursive: true, force: true });
    for (const f of SKILL_FILES) {
      const s = path.join(from, f);
      if (!fs.existsSync(s)) continue;
      fs.statSync(s).isDirectory() ? copyDir(s, path.join(dir, f)) : (fs.mkdirSync(dir, { recursive: true }), fs.copyFileSync(s, path.join(dir, f)));
    }
    if (keep) fs.writeFileSync(path.join(dir, ".env"), keep, { mode: 0o600 });
    log(`${agent}: installed ${VERSION} → ${dir}`);
    done.push([agent, dir]);
  }
  return done;
}

export function uninstall(flags = {}, { home, cwd, log = console.log } = {}) {
  const which = flags.claude || flags.codex ? flags : { ...flags, claude: true, codex: true };
  for (const [agent, dir] of targets(which, home, cwd)) {
    if (isLink(dir)) {
      fs.unlinkSync(dir);
      log(`${agent}: removed link ${dir}`);
      continue;
    }
    if (!fs.existsSync(path.join(dir, "SKILL.md"))) continue;
    if (fs.existsSync(path.join(dir, ".git")) && !flags.force) {
      log(`${agent}: ${dir} is a git clone — remove it yourself (or pass --force)`);
      continue;
    }
    fs.rmSync(dir, { recursive: true, force: true });
    log(`${agent}: removed ${dir}`);
  }
}

const KEYS = {
  "Google Search Console": ["GSC_SITE", "GSC_BRAND", "GOOGLE_OAUTH_JSON", "GOOGLE_TOKEN_JSON", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"],
  "Bing Webmaster": ["BING_API_KEY", "BING_SITE"],
  IndexNow: ["INDEXNOW_KEY", "INDEXNOW_HOST", "INDEXNOW_KEY_LOCATION"],
};

function doctor() {
  const env = loadEnv();
  console.log(`zoro-seo-audit ${VERSION} · Node ${process.versions.node}${Number(process.versions.node.split(".")[0]) < 20 ? "  ✖ Node 20 or newer is required" : ""}`);
  console.log(`running from ${SKILL_ROOT}\n`);
  console.log("Installed skill");
  for (const [agent, dir] of [...targets({ claude: true, codex: true }), ...targets({ claude: true, codex: true, project: true })]) {
    const f = path.join(dir, "SKILL.md");
    if (!fs.existsSync(f)) continue;
    const v = (fs.readFileSync(f, "utf8").match(/version:\s*"?([\d.]+)/) ?? [])[1] ?? "?";
    console.log(`  ✔ ${agent.padEnd(6)} ${v.padEnd(8)} ${dir}`);
  }
  console.log("\nSettings files (first wins)");
  const found = foundEnvFiles();
  if (!found.length) console.log(`  none — the audit needs no keys; run "zoro-seo-audit setup" for Search Console / Bing / IndexNow`);
  for (const f of found) console.log(`  ✔ ${f}`);
  console.log("\nKeys (values are never printed)");
  for (const [group, keys] of Object.entries(KEYS)) console.log(`  ${group}: ${keys.filter((k) => env[k]).join(", ") || "not set"}`);
}

/** Writes key=value pairs into an .env file, keeping the other lines. */
export function writeEnv(file, values) {
  const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "# zoro-seo-audit settings — keep this file private\n";
  const have = parseEnv(old);
  const lines = old.split(/\r?\n/).map((l) => {
    const m = l.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    return m && m[1] in values ? `${m[1]}=${values[m[1]]}` : l;
  });
  for (const [k, v] of Object.entries(values)) if (!(k in have)) lines.push(`${k}=${v}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join("\n").replace(/\n*$/, "\n"), { mode: 0o600 });
}

async function setup() {
  const dir = configDir();
  const file = path.join(dir, ".env");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q, def = "") => ((await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim() || def);
  const yes = async (q) => /^y/i.test(await ask(`${q} (y/N)`));
  const cur = fs.existsSync(file) ? parseEnv(fs.readFileSync(file, "utf8")) : {};
  console.log(`Settings are saved to ${file}\nThe site audit itself needs no keys. Press Enter to skip a question.\nGuide: references/api-setup.md\n`);
  const v = {};
  try {
    if (await yes("Set up Google Search Console?")) {
      v.GSC_SITE = await ask("Property (sc-domain:example.com or https://example.com/)", cur.GSC_SITE);
      v.GSC_BRAND = await ask("Brand words to ignore in reports, comma separated", cur.GSC_BRAND);
      const client = await ask("Path to the OAuth client JSON (Desktop app) from Google Cloud", cur.GOOGLE_OAUTH_JSON);
      if (client) {
        const dest = path.join(dir, "google-client.json");
        fs.mkdirSync(dir, { recursive: true });
        if (path.resolve(client) !== dest) fs.copyFileSync(client, dest);
        fs.chmodSync(dest, 0o600);
        v.GOOGLE_OAUTH_JSON = dest;
        const token = path.join(dir, "google-token.json");
        if (await yes("Open the Google consent page now to create a refresh token?")) {
          rl.pause();
          const { main } = await import("../scripts/google-auth.mjs");
          await main(["--client", dest, "--out", token]);
          rl.resume();
        }
        if (fs.existsSync(token)) v.GOOGLE_TOKEN_JSON = token;
      }
    }
    if (await yes("Set up Bing Webmaster?")) {
      v.BING_API_KEY = await ask("Bing API key", cur.BING_API_KEY);
      v.BING_SITE = await ask("Site URL (https://example.com/)", cur.BING_SITE);
    }
    if (await yes("Set up IndexNow?")) {
      v.INDEXNOW_HOST = await ask("Host (example.com)", cur.INDEXNOW_HOST);
      v.INDEXNOW_KEY = await ask("Key (leave empty to generate one)", cur.INDEXNOW_KEY) || crypto.randomUUID().replace(/-/g, "");
      console.log(`  Serve the key at https://${v.INDEXNOW_HOST}/${v.INDEXNOW_KEY}.txt (file content: the key), then run "zoro-seo-audit indexnow check".`);
    }
  } finally {
    rl.close();
  }
  const clean = Object.fromEntries(Object.entries(v).filter(([, x]) => x));
  if (!Object.keys(clean).length) return console.log("Nothing saved.");
  writeEnv(file, clean);
  console.log(`\nSaved ${Object.keys(clean).join(", ")} to ${file}`);
}

const TOOLS = { audit: "../scripts/audit.mjs", gsc: "../scripts/gsc.mjs", bing: "../scripts/bing.mjs", indexnow: "../scripts/indexnow.mjs", "google-auth": "../scripts/google-auth.mjs" };

export async function run(argv = process.argv.slice(2)) {
  const [cmd, ...rest] = argv;
  const flags = Object.fromEntries(rest.filter((a) => a.startsWith("--")).map((a) => [a.slice(2), true]));
  if (!cmd || ["help", "--help", "-h"].includes(cmd)) return console.log(HELP);
  if (["--version", "-v", "version"].includes(cmd)) return console.log(VERSION);
  if (cmd === "install") return void install(flags);
  if (cmd === "uninstall") return uninstall(flags);
  if (cmd === "doctor") return doctor();
  if (cmd === "setup") return setup();
  if (TOOLS[cmd]) return (await import(TOOLS[cmd])).main(rest);
  if (/^https?:\/\//i.test(cmd) || /^[\w-]+(\.[\w-]+)+(\/|$)/.test(cmd)) return (await import(TOOLS.audit)).main([/^https?:/i.test(cmd) ? cmd : `https://${cmd}`, ...rest]);
  console.error(`unknown command "${cmd}"\n`);
  console.log(HELP);
  process.exitCode = 2;
}

if (isMain(import.meta.url))
  run().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });

export { envFiles, targets };
