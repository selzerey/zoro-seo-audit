#!/usr/bin/env node
// Blocks commits that would publish private names or secrets.
//   Private words: one per line in `.leak-words` (git-ignored, never committed) and/or ZORO_LEAK_WORDS="a,b".
//   Secrets: common key/token shapes, plus any *.env / token / credential file being tracked.
// Usage: node scripts/leak-check.mjs [--all]   (default: staged files; --all: every tracked file)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { isMain } from "./lib/args.mjs";
import { loadEnv } from "./lib/env.mjs";

export const SECRET_PATTERNS = [
  [/AKIA[0-9A-Z]{16}/, "AWS access key"],
  [/ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}/, "GitHub token"],
  [/sk-(?:ant-|proj-)?[A-Za-z0-9_-]{24,}/, "API secret key"],
  [/AIza[0-9A-Za-z_-]{35}/, "Google API key"],
  [/1\/\/0[0-9A-Za-z_-]{30,}/, "Google refresh token"],
  [/GOCSPX-[0-9A-Za-z_-]{20,}/, "Google client secret"],
  [/npm_[A-Za-z0-9]{36}/, "npm token"],
  [/xox[abpr]-[0-9A-Za-z-]{10,}/, "Slack token"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@/, "database URL with password"],
];
const BAD_FILES = /(^|\/)(\.env(\..+)?|.*token.*\.json|.*credential.*|.*\.pem|\.leak-words)$/i;
const ALLOWED_FILES = /(^|\/)\.env\.example$/;

export function words(root, env) {
  const list = [];
  try {
    list.push(...fs.readFileSync(path.join(root, ".leak-words"), "utf8").split(/\r?\n/));
  } catch {
    /* optional */
  }
  list.push(...(env.ZORO_LEAK_WORDS ?? "").split(","));
  return [...new Set(list.map((w) => w.trim()).filter((w) => w && !w.startsWith("#")))];
}

/** Problems in one file's text: private words (case-insensitive, Turkish-aware) and secret shapes. */
export function scan(text, file, privateWords) {
  const out = [];
  const lower = text.toLocaleLowerCase("tr");
  for (const w of privateWords) if (lower.includes(w.toLocaleLowerCase("tr"))) out.push(`${file}: private word "${w.slice(0, 2)}…"`);
  for (const [re, name] of SECRET_PATTERNS) if (re.test(text)) out.push(`${file}: looks like a ${name}`);
  return out;
}

export function main(argv = process.argv.slice(2)) {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const files = (argv.includes("--all") ? execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }) : execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], { cwd: root, encoding: "utf8" }))
    .split(/\r?\n/)
    .filter(Boolean);
  const privateWords = words(root, loadEnv());
  const problems = [];
  for (const f of files) {
    if (BAD_FILES.test(f) && !ALLOWED_FILES.test(f)) problems.push(`${f}: secret-like file must not be committed`);
    if (f.startsWith("node_modules/")) continue;
    let text;
    try {
      text = argv.includes("--all") ? fs.readFileSync(path.join(root, f), "utf8") : execFileSync("git", ["show", `:${f}`], { cwd: root, encoding: "utf8", maxBuffer: 50e6 });
    } catch {
      continue;
    }
    problems.push(...scan(text, f, privateWords));
  }
  if (!privateWords.length) console.error("leak-check: no private words configured (.leak-words or ZORO_LEAK_WORDS) — only secret patterns checked");
  if (problems.length) {
    console.error("leak-check FAILED:\n" + problems.map((p) => "  " + p).join("\n"));
    process.exitCode = 1;
  } else console.error(`leak-check OK (${files.length} file(s))`);
}

if (isMain(import.meta.url)) main();
