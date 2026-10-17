#!/usr/bin/env node
// Usage: node scripts/audit.mjs <url> [--max 50] [--concurrency 4] [--delay 100] [--check-links 300]
//        [--lang tr|en] [--format md|json] [--out file] [--only id,cat] [--skip id,id] [--ua "..."] [--quiet]
//        [--stale-file facts.txt] [--placeholders key,key] [--dev-hosts preview.example.net,…]
import fs from "node:fs";
import { isMain, parseArgs } from "./lib/args.mjs";
import { crawl } from "./lib/crawl.mjs";
import { loadEnv } from "./lib/env.mjs";
import { DEFAULT_UA, fetchChain, pool } from "./lib/fetch.mjs";
import { toJson, toMarkdown } from "./lib/report.mjs";
import { parseStale } from "./lib/rules/content.mjs";
import { runRules } from "./lib/rules/index.mjs";

/** The other host spellings of the site (http, www/non-www) and where they end up. */
export function hostVariants(start) {
  const u = new URL(start);
  const bare = u.host.replace(/^www\./, "");
  const alt = u.host.startsWith("www.") ? bare : `www.${bare}`;
  return [`http://${u.host}/`, `https://${alt}/`, `http://${alt}/`];
}

/** Status and content type of the home page's first declared icon (or /favicon.ico when none is declared). */
export async function faviconProbe(ctx, ua) {
  const home = ctx.pages.get(ctx.start)?.facts;
  const url = home?.icons?.[0] ?? `${ctx.origin}/favicon.ico`;
  const r = await fetchChain(url, { ua });
  return { url, declared: !!home?.icons?.length, status: r.status, type: r.headers?.["content-type"] ?? "" };
}

/** /llms.txt: status, body and the status of up to `maxLinks` links in it (one request when the file is absent). */
export async function llmsProbe(ctx, ua, { maxLinks = 20 } = {}) {
  const url = `${ctx.origin}/llms.txt`;
  const r = await fetchChain(url, { ua });
  const out = { url, status: r.status, type: r.headers?.["content-type"] ?? "", body: r.status === 200 ? r.body.slice(0, 500000) : "", links: [] };
  if (r.status !== 200 || /html/i.test(out.type)) return out;
  const hrefs = [...new Set([...out.body.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => {
    try {
      return new URL(m[1], url).href;
    } catch {
      return null;
    }
  }))].filter((u) => u?.startsWith("http")).slice(0, maxLinks);
  out.links = await pool(hrefs, 4, async (u) => {
    let x = await fetchChain(u, { ua, method: "HEAD" });
    if ([403, 405, 501].includes(x.status)) x = await fetchChain(u, { ua });
    return { url: u, status: x.status, hops: x.chain.length };
  });
  return out;
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
  ctx.lang = a.lang ?? null;
  // Optional lists: old values (stale-fact), literal shortcodes (placeholder-leak), preview hosts (link-dev-host).
  const staleFile = a["stale-file"] ?? env.ZORO_STALE_FILE;
  ctx.stale = [...(staleFile ? parseStale(fs.readFileSync(staleFile, "utf8")) : []), ...parseStale(env.ZORO_STALE_VALUES ?? "")];
  const list = (v) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  ctx.placeholders = list(a.placeholders ?? env.ZORO_PLACEHOLDERS);
  ctx.devHosts = list(a["dev-hosts"] ?? env.ZORO_DEV_HOSTS).map((h) => h.toLowerCase());
  ctx.probes = { hosts: await Promise.all(hostVariants(ctx.start).map((u) => fetchChain(u, { ua }))), favicon: await faviconProbe(ctx, ua), llms: await llmsProbe(ctx, ua) };
  const results = runRules(ctx, { only: a.only?.split(","), skip: a.skip?.split(",") ?? [] });
  const out = a.format === "json" ? toJson(ctx, results) : toMarkdown(ctx, results, { lang: a.lang ?? "tr" });
  if (a.out) {
    fs.writeFileSync(a.out, out);
    log(`report: ${a.out}`);
  } else console.log(out);
  return results;
}

if (isMain(import.meta.url)) main();
