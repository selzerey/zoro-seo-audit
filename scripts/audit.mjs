#!/usr/bin/env node
// Usage: node scripts/audit.mjs <url> [--max 50] [--concurrency 4] [--delay 100] [--check-links 300]
//        [--lang tr|en] [--format md|json] [--out file] [--only id,cat] [--skip id,id] [--ua "..."] [--quiet]
import fs from "node:fs";
import { isMain, parseArgs } from "./lib/args.mjs";
import { crawl } from "./lib/crawl.mjs";
import { loadEnv } from "./lib/env.mjs";
import { DEFAULT_UA, fetchChain } from "./lib/fetch.mjs";
import { toJson, toMarkdown } from "./lib/report.mjs";
import { runRules } from "./lib/rules/index.mjs";

/** The other host spellings of the site (http, www/non-www) and where they end up. */
export function hostVariants(start) {
  const u = new URL(start);
  const bare = u.host.replace(/^www\./, "");
  const alt = u.host.startsWith("www.") ? bare : `www.${bare}`;
  return [`http://${u.host}/`, `https://${alt}/`, `http://${alt}/`];
}

export async function main(argv = process.argv.slice(2)) {
  const env = loadEnv();
  const a = parseArgs(argv);
  const start = a._[0];
  if (!start) {
    console.error("usage: node scripts/audit.mjs <url> [--max 50] [--format md|json] [--out file]");
    process.exit(2);
  }
  const ua = a.ua ?? env.ZORO_UA ?? DEFAULT_UA;
  const log = a.quiet ? () => {} : (m) => console.error(m);
  const ctx = await crawl(new URL(start).href, {
    max: Number(a.max ?? 50),
    concurrency: Number(a.concurrency ?? 4),
    delay: Number(a.delay ?? 100),
    checkLinks: Number(a["check-links"] ?? 300),
    ua,
    log,
  });
  ctx.probes = { hosts: await Promise.all(hostVariants(ctx.start).map((u) => fetchChain(u, { ua }))) };
  const results = runRules(ctx, { only: a.only?.split(","), skip: a.skip?.split(",") ?? [] });
  const out = a.format === "json" ? toJson(ctx, results) : toMarkdown(ctx, results, { lang: a.lang ?? "tr" });
  if (a.out) {
    fs.writeFileSync(a.out, out);
    log(`report: ${a.out}`);
  } else console.log(out);
  return results;
}

if (isMain(import.meta.url)) main();
