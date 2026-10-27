#!/usr/bin/env node
// Core Web Vitals from the Chrome UX Report (CrUX) API: real-user field data, the numbers Search Console shows.
//   node scripts/cwv.mjs <url> [<url> ...] [--origin] [--form phone|desktop] [--format md|json] [--out file]
// --origin asks for the whole origin instead of each page (pages with few visitors have no page-level data).
// Needs CRUX_API_KEY (Google Cloud → enable "Chrome UX Report API" → API key). Nothing is sent but the URL.
// Thresholds (Google, 2026): LCP ≤ 2.5 s good / > 4 s poor · INP ≤ 200 ms / > 500 ms · CLS ≤ 0.1 / > 0.25.
import fs from "node:fs";
import { isMain, parseArgs, usageOf } from "./lib/args.mjs";
import { loadEnv } from "./lib/env.mjs";

const API = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";
export const METRICS = {
  largest_contentful_paint: { label: "LCP", unit: "ms", good: 2500, poor: 4000 },
  interaction_to_next_paint: { label: "INP", unit: "ms", good: 200, poor: 500 },
  cumulative_layout_shift: { label: "CLS", unit: "", good: 0.1, poor: 0.25 },
  first_contentful_paint: { label: "FCP", unit: "ms", good: 1800, poor: 3000 },
  experimental_time_to_first_byte: { label: "TTFB", unit: "ms", good: 800, poor: 1800 },
};

export const rating = (key, p75) => (p75 == null ? "no data" : p75 <= METRICS[key].good ? "good" : p75 <= METRICS[key].poor ? "needs improvement" : "poor");

/** One row per metric from a CrUX record: p75, rating, share of good/needs-improvement/poor visits. */
export function summarise(record) {
  const out = [];
  for (const [key, m] of Object.entries(METRICS)) {
    const r = record?.metrics?.[key];
    if (!r) continue;
    const p75 = Number(r.percentiles?.p75 ?? NaN);
    const dist = (r.histogram ?? []).map((h) => Math.round((h.density ?? 0) * 100));
    out.push({ key, label: m.label, p75: Number.isNaN(p75) ? null : p75, rating: rating(key, Number.isNaN(p75) ? null : p75), good: dist[0] ?? null, ni: dist[1] ?? null, poor: dist[2] ?? null });
  }
  return out;
}

export async function queryRecord(target, { key, form = "PHONE", origin = false, fetchImpl = fetch } = {}) {
  const body = { [origin ? "origin" : "url"]: target, formFactor: form.toUpperCase() };
  const r = await fetchImpl(`${API}?key=${encodeURIComponent(key)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (r.status === 404) return { target, record: null, period: null, note: "no CrUX data (too few visitors for this URL; try --origin)" };
  if (!r.ok) throw new Error(`CrUX ${r.status}: ${j.error?.message ?? ""}`.trim());
  const p = j.record?.collectionPeriod;
  const fmt = (d) => (d ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}` : "?");
  return { target, record: j.record, period: p ? `${fmt(p.firstDate)} → ${fmt(p.lastDate)}` : null };
}

const table = (head, rows) => [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");

export async function main(argv = process.argv.slice(2)) {
  const env = loadEnv();
  const a = parseArgs(argv, ["quiet", "origin"]);
  if (!a._.length || a.help) return console.log(usageOf(import.meta.url));
  const key = env.CRUX_API_KEY;
  if (!key) throw new Error("CRUX_API_KEY is missing (Google Cloud → Chrome UX Report API → API key). See references/api-setup.md");
  const form = a.form ?? "phone";
  const results = [];
  for (const u of a._) {
    const target = a.origin ? new URL(u).origin : u;
    results.push(await queryRecord(target, { key, form, origin: !!a.origin }));
  }
  const out = (s) => (a.out ? (fs.writeFileSync(a.out, s), console.error(`written: ${a.out}`)) : console.log(s));
  if (a.format === "json") return out(JSON.stringify(results.map((r) => ({ target: r.target, period: r.period, note: r.note, metrics: summarise(r.record) })), null, 2));
  const md = [`# Core Web Vitals (CrUX field data, ${form}${a.origin ? ", origin level" : ""})`, ""];
  for (const r of results) {
    md.push(`## ${r.target}${r.period ? ` (${r.period})` : ""}`, "");
    if (!r.record) {
      md.push(r.note ?? "no data", "");
      continue;
    }
    md.push(table(["metric", "p75", "rating", "good %", "needs impr. %", "poor %"], summarise(r.record).map((m) => [m.label, m.p75 == null ? "-" : m.key === "cumulative_layout_shift" ? m.p75 : `${m.p75} ms`, m.rating, m.good ?? "-", m.ni ?? "-", m.poor ?? "-"])), "");
  }
  md.push("Fix order: poor LCP (server time, hero image preload/size, render-blocking CSS) → INP (long tasks, heavy handlers) → CLS (image/ad dimensions, fonts). Field data lags ~28 days; re-check a month after the fix.", "");
  return out(md.join("\n"));
}

if (isMain(import.meta.url))
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
