// Command line installer, settings files and polite fetching (429 / Retry-After).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { install, uninstall, writeEnv } from "../../cli/zoro-seo-audit.mjs";
import { configDir, envFiles, parseEnv, SKILL_ROOT } from "../lib/env.mjs";
import { fetchChain, retryAfter } from "../lib/fetch.mjs";
import { runRules } from "../lib/rules/index.mjs";
import { crawl } from "../lib/crawl.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "zoro-cli-"));
const quiet = { log: () => {} };
const CLI = path.join(SKILL_ROOT, "cli", "zoro-seo-audit.mjs");

test("install: copies the skill for Claude Code and Codex, without tests; keeps an existing .env", () => {
  const home = tmp();
  fs.mkdirSync(path.join(home, ".claude"));
  fs.mkdirSync(path.join(home, ".codex"));
  const done = install({}, { home, ...quiet });
  assert.deepEqual(done.map(([a]) => a), ["claude", "codex"]);
  for (const [, dir] of done) {
    for (const f of ["SKILL.md", "scripts/audit.mjs", "scripts/lib/vendor/node-html-parser.mjs", "agents/openai.yaml", "cli/zoro-seo-audit.mjs", "references/false-positives.md"]) assert.ok(fs.existsSync(path.join(dir, f)), f);
    assert.ok(!fs.existsSync(path.join(dir, "scripts", "tests")));
  }
  const env = path.join(done[0][1], ".env");
  fs.writeFileSync(env, "BING_API_KEY=keep");
  install({ claude: true }, { home, ...quiet });
  assert.equal(fs.readFileSync(env, "utf8"), "BING_API_KEY=keep");
  uninstall({}, { home, ...quiet });
  assert.ok(!fs.existsSync(done[0][1]) && !fs.existsSync(done[1][1]));
});

test("install: never deletes through a link or over a git clone", () => {
  const home = tmp();
  const clone = path.join(tmp(), "my-clone");
  fs.mkdirSync(path.join(clone, ".git"), { recursive: true });
  fs.writeFileSync(path.join(clone, "SKILL.md"), "mine");
  const link = path.join(home, ".claude", "skills", "zoro-seo-audit");
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(clone, link, "junction");
  install({ claude: true }, { home, ...quiet });
  assert.equal(fs.readFileSync(path.join(clone, "SKILL.md"), "utf8"), "mine");
  const dir = path.join(home, ".agents", "skills", "zoro-seo-audit");
  fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
  install({ codex: true }, { home, ...quiet });
  assert.ok(!fs.existsSync(path.join(dir, "SKILL.md")));
  uninstall({ claude: true }, { home, ...quiet });
  assert.ok(fs.existsSync(path.join(clone, "SKILL.md")), "uninstall removes only the link");
});

test("settings: ~/.config/zoro-seo-audit/.env is read; writeEnv keeps other lines and comments", () => {
  const home = tmp();
  assert.ok(envFiles(home, home, {}).includes(path.join(configDir(home, {}), ".env")));
  const f = path.join(configDir(home, {}), ".env");
  writeEnv(f, { BING_API_KEY: "a" });
  fs.appendFileSync(f, "# note\nOTHER=1\n");
  writeEnv(f, { BING_API_KEY: "b", BING_SITE: "https://example.com/" });
  const text = fs.readFileSync(f, "utf8");
  assert.deepEqual(parseEnv(text), { BING_API_KEY: "b", OTHER: "1", BING_SITE: "https://example.com/" });
  assert.match(text, /# note/);
});

test("cli: version, help, unknown command", () => {
  const run = (...a) => execFileSync(process.execPath, [CLI, ...a], { encoding: "utf8" });
  assert.match(run("--version"), /^\d+\.\d+\.\d+/);
  assert.match(run("help"), /zoro-seo-audit <url>/);
  assert.match(run("gsc", "help"), /Search Console/);
  assert.throws(() => execFileSync(process.execPath, [CLI, "nope"], { stdio: "pipe" }));
});

test("retryAfter: seconds, HTTP date, cap", () => {
  assert.equal(retryAfter("3"), 3);
  assert.equal(retryAfter("999"), 30);
  assert.equal(retryAfter(null), null);
  assert.ok(retryAfter(new Date(Date.now() + 5000).toUTCString()) <= 6);
});

test("429: retried after the pause; a link that stays 429 is rate-limited, not broken", async () => {
  let hits = 0;
  const srv = http.createServer((req, res) => {
    if (req.url === "/busy") {
      hits++;
      res.writeHead(hits < 2 ? 429 : 200, { "content-type": "text/html", "retry-after": "1" });
      return res.end("<html><head><title>ok</title></head><body>ok</body></html>");
    }
    if (req.url === "/always") {
      res.writeHead(429, { "retry-after": "1" });
      return res.end();
    }
    if (req.url === "/robots.txt") return res.end("User-agent: *\nAllow: /\n");
    if (req.url === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end('<!doctype html><html lang="en"><head><title>Home</title></head><body><main><a href="/always">a</a></main></body></html>');
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const o = `http://127.0.0.1:${srv.address().port}`;
  try {
    const r = await fetchChain(`${o}/busy`, { sleep: async () => {} });
    assert.equal(r.status, 200);
    assert.equal(hits, 2);
    const ctx = await crawl(`${o}/`, { max: 1, concurrency: 1, delay: 0, checkLinks: 10, log: () => {} });
    ctx.probes = { hosts: [] };
    const ids = runRules(ctx).map((x) => x.id);
    assert.ok(ids.includes("rate-limited"), ids.join());
    assert.ok(!ids.includes("internal-link-broken"));
  } finally {
    srv.close();
  }
});

test("429 on probes: host variants and favicon are not judged, they are listed as rate-limited", () => {
  const O = "https://site.test";
  const ctx = {
    start: `${O}/`,
    origin: O,
    pages: new Map(),
    linkStatus: new Map(),
    probes: {
      hosts: [
        { url: "http://site.test/", status: 429, chain: [{ url: "http://site.test/", status: 301 }, { url: `${O}/`, status: 429 }] },
        { url: "https://www.site.test/", status: 429, chain: [{ url: "https://www.site.test/", status: 429 }] },
        { url: "http://www.site.test/", status: 429, chain: [{ url: "http://www.site.test/", status: 302 }, { url: `${O}/`, status: 429 }] },
      ],
      favicon: { url: `${O}/favicon.ico`, status: 429, type: "text/html", declared: false },
    },
  };
  const r = Object.fromEntries(runRules(ctx, { only: ["host-normalisation", "favicon-missing", "rate-limited"] }).map((x) => [x.id, x.findings]));
  assert.deepEqual(r["host-normalisation"]?.map((f) => f.url), ["http://www.site.test/"], "only the 302 is a real problem");
  assert.ok(!r["favicon-missing"]);
  assert.match(r["rate-limited"][0].detail, /^4 URL/);
});
