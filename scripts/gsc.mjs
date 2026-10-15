#!/usr/bin/env node
// Search Console loop. Usage:
//   node scripts/gsc.mjs sites
//   node scripts/gsc.mjs report    --site sc-domain:example.com [--days 28] [--brand name1,name2] [--min 50] [--out file.md]
//   node scripts/gsc.mjs inspect   --site sc-domain:example.com <url> [<url> ...]
//   node scripts/gsc.mjs sitemaps  --site sc-domain:example.com
//   node scripts/gsc.mjs zero      --site sc-domain:example.com --sitemap https://example.com/sitemap.xml [--days 90]
// GSC_SITE in env replaces --site. Data lags ~2-3 days; the window ends 3 days ago.
import fs from "node:fs";
import { isMain, parseArgs } from "./lib/args.mjs";
import { readSitemaps } from "./lib/crawl.mjs";
import { loadEnv } from "./lib/env.mjs";
import { googleClient } from "./lib/google.mjs";
import { cannibalisation, lowCtr, strikingDistance, urlVariants, zeroImpression } from "./lib/gsc-analysis.mjs";

const API = "https://www.googleapis.com/webmasters/v3";
const day = (offset) => new Date(Date.now() - offset * 864e5).toISOString().slice(0, 10);

async function query(g, site, days, dimensions, rowLimit = 25000) {
  const rows = [];
  for (let startRow = 0; ; startRow += rowLimit) {
    const r = await g("POST", `${API}/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
      startDate: day(days + 3),
      endDate: day(3),
      dimensions,
      rowLimit,
      startRow,
      dataState: "final",
    });
    rows.push(...(r?.rows ?? []));
    if (!r?.rows || r.rows.length < rowLimit || rows.length >= 100000) return rows;
  }
}

const table = (head, rows) => [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");

export async function main(argv = process.argv.slice(2)) {
  const env = loadEnv();
  const a = parseArgs(argv);
  const [cmd, ...rest] = a._;
  const site = a.site ?? env.GSC_SITE;
  const g = googleClient(env);
  const out = (s) => (a.out ? (fs.writeFileSync(a.out, s), console.error(`written: ${a.out}`)) : console.log(s));

  if (cmd === "sites") return out(JSON.stringify((await g("GET", `${API}/sites`)).siteEntry ?? [], null, 2));
  if (!site) throw new Error("--site (or GSC_SITE) is required, e.g. sc-domain:example.com");

  if (cmd === "sitemaps") return out(JSON.stringify((await g("GET", `${API}/sites/${encodeURIComponent(site)}/sitemaps`)).sitemap ?? [], null, 2));

  if (cmd === "inspect") {
    const res = [];
    for (const url of rest) {
      const r = await g("POST", "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", { inspectionUrl: url, siteUrl: site });
      const i = r.inspectionResult?.indexStatusResult ?? {};
      res.push([url, i.verdict, i.coverageState, i.googleCanonical ?? "-", i.lastCrawlTime?.slice(0, 10) ?? "-"]);
    }
    return out(table(["url", "verdict", "coverage", "google canonical", "last crawl"], res));
  }

  const days = Number(a.days ?? (cmd === "zero" ? 90 : 28));
  if (cmd === "zero") {
    if (!a.sitemap) throw new Error("--sitemap is required");
    const sm = await readSitemaps([a.sitemap], {});
    const pages = await query(g, site, days, ["page"]);
    const zero = zeroImpression([...sm.urls.keys()], pages);
    return out(`# ${zero.length}/${sm.urls.size} sitemap URLs with 0 impressions in ${days} days\n\n` + zero.map((u) => `- ${u} (lastmod ${sm.urls.get(u) ?? "-"})`).join("\n"));
  }

  if (cmd === "report") {
    const brand = (a.brand ?? env.GSC_BRAND ?? "").split(",").filter(Boolean).map((s) => s.toLocaleLowerCase("tr"));
    const [qp, pg] = await Promise.all([query(g, site, days, ["query", "page"]), query(g, site, days, ["page"])]);
    const total = pg.reduce((s, r) => ({ c: s.c + r.clicks, i: s.i + r.impressions }), { c: 0, i: 0 });
    // --min scales every threshold (young sites: --min 10).
    const min = Number(a.min ?? 50);
    const can = cannibalisation(qp, { exclude: brand, minImpressions: Math.max(5, Math.round(min * 0.6)) }).slice(0, 30);
    const sd = strikingDistance(qp, { minImpressions: min }).slice(0, 40);
    const lc = lowCtr(pg, { minImpressions: min * 2 }).slice(0, 30);
    const uv = urlVariants(pg);
    const md = [
      `# Search Console: ${site} (${day(days + 3)} → ${day(3)})`,
      "",
      `${total.c} clicks · ${total.i} impressions · ${pg.length} pages with impressions`,
      "",
      `## Cannibalisation (${can.length})`,
      "Several pages split one query. Pick one target page, merge or differentiate the others, point internal links at the target.",
      "",
      table(["query", "impr.", "pages (impr. / pos.)"], can.map((q) => [q.query, q.impressions, q.pages.map((p) => `${p.page} (${p.impressions}/${p.position.toFixed(1)})`).join("<br>")])),
      "",
      `## Striking distance, positions 4-20 (${sd.length})`,
      "Improve the page for this query: answer it in the first paragraph, add the term to a heading, add internal links from strong pages.",
      "",
      table(["query", "page", "impr.", "clicks", "pos."], sd.map((r) => [r.query, r.page, r.impressions, r.clicks, r.position])),
      "",
      `## Low CTR on page 1 (${lc.length})`,
      "Rewrite title/description to match the query intent; check that the snippet is not an AI Overview-only query.",
      "",
      table(["page", "impr.", "CTR %", "expected %", "pos."], lc.map((r) => [r.page, r.impressions, r.ctr, r.expected, r.position])),
      "",
      `## URL variants (${uv.length})`,
      "One page reported under several spellings (slash, case, query). Check every variant redirects (301/308) to the canonical; then it heals on recrawl.",
      "",
      table(["variants (impr. / clicks)"], uv.slice(0, 40).map((v) => [v.map((x) => `${x.page} (${x.impressions}/${x.clicks})`).join("<br>")])),
      "",
    ].join("\n");
    return out(md);
  }
  throw new Error(`unknown command: ${cmd ?? "(none)"} — use sites | report | inspect | sitemaps | zero`);
}

if (isMain(import.meta.url))
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
