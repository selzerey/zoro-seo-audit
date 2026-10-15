#!/usr/bin/env node
// Bing Webmaster API (key: Bing Webmaster > Settings > API access). Usage:
//   node scripts/bing.mjs sites
//   node scripts/bing.mjs queries --site https://example.com/ [--top 50]
//   node scripts/bing.mjs pages   --site https://example.com/ [--top 50]
//   node scripts/bing.mjs crawl-issues --site https://example.com/
//   node scripts/bing.mjs quota   --site https://example.com/
//   node scripts/bing.mjs submit  --site https://example.com/ <url> [<url> ...]   (counts against the daily quota)
// BING_API_KEY and BING_SITE come from env. Stats cover roughly the last 6 months, summed per query/page.
// The "AI Performance" (Copilot citations) report is in the web UI only: /webmasters/aiperformance?siteUrl=<site>
import { pathToFileURL } from "node:url";
import { parseArgs } from "./lib/args.mjs";
import { loadEnv } from "./lib/env.mjs";

const API = "https://ssl.bing.com/webmaster/api.svc/json";

export function sumStats(rows, key = "Query") {
  const m = new Map();
  for (const r of rows ?? []) {
    const k = r[key];
    const s = m.get(k) ?? { key: k, impressions: 0, clicks: 0, posSum: 0 };
    s.impressions += r.Impressions ?? 0;
    s.clicks += r.Clicks ?? 0;
    s.posSum += (r.AvgImpressionPosition ?? 0) * (r.Impressions ?? 0);
    m.set(k, s);
  }
  return [...m.values()]
    .map((s) => ({ key: s.key, impressions: s.impressions, clicks: s.clicks, position: s.impressions ? +(s.posSum / s.impressions).toFixed(1) : null }))
    .sort((a, b) => b.impressions - a.impressions);
}

export async function main(argv = process.argv.slice(2)) {
  const env = loadEnv();
  const a = parseArgs(argv);
  const [cmd, ...rest] = a._;
  const key = env.BING_API_KEY;
  if (!key) throw new Error("BING_API_KEY missing (see .env.example)");
  const site = a.site ?? env.BING_SITE;
  const call = async (method, params = {}, body) => {
    const qs = new URLSearchParams({ ...params, apikey: key });
    const r = await fetch(`${API}/${method}?${qs}`, body ? { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body) } : {});
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} -> ${r.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text).d : null;
  };
  const top = Number(a.top ?? 50);
  const print = (rows) => console.log(["| key | impr. | clicks | pos. |", "|---|---|---|---|", ...rows.slice(0, top).map((r) => `| ${r.key} | ${r.impressions} | ${r.clicks} | ${r.position ?? "-"} |`)].join("\n"));

  if (cmd === "sites") return console.log(JSON.stringify((await call("GetUserSites")).map((s) => ({ url: s.Url, verified: s.IsVerified })), null, 2));
  if (!site) throw new Error("--site (or BING_SITE) is required");
  if (cmd === "queries") return print(sumStats(await call("GetQueryStats", { siteUrl: site })));
  if (cmd === "pages") return print(sumStats(await call("GetPageStats", { siteUrl: site })));
  if (cmd === "crawl-issues") return console.log(JSON.stringify(await call("GetCrawlIssues", { siteUrl: site }), null, 2));
  if (cmd === "quota") return console.log(JSON.stringify(await call("GetUrlSubmissionQuota", { siteUrl: site })));
  if (cmd === "submit") {
    if (!rest.length) throw new Error("give at least one URL");
    await call("SubmitUrlBatch", {}, { siteUrl: site, urlList: rest });
    return console.log(`submitted ${rest.length} URL(s)`);
  }
  throw new Error(`unknown command: ${cmd ?? "(none)"} — use sites | queries | pages | crawl-issues | quota | submit`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => {
    console.error(e.message.replace(/apikey=[^&\s]+/g, "apikey=***"));
    process.exit(1);
  });
