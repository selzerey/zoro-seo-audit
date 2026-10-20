import content from "./content.mjs";
import hreflang from "./hreflang.mjs";
import links from "./links.mjs";
import onpage from "./onpage.mjs";
import schema from "./schema.mjs";
import site from "./site.mjs";
import technical from "./technical.mjs";

export const RULES = [
  ...site.map((r) => ({ ...r, cat: "site" })),
  ...technical.map((r) => ({ ...r, cat: "technical" })),
  ...hreflang.map((r) => ({ ...r, cat: "hreflang" })),
  ...links.map((r) => ({ ...r, cat: "links" })),
  ...onpage.map((r) => ({ ...r, cat: "onpage" })),
  ...schema.map((r) => ({ ...r, cat: "schema" })),
  ...content.map((r) => ({ ...r, cat: "content" })),
];

const ORDER = { error: 0, warn: 1, info: 2 };

/** Runs every rule; a rule that throws is reported, never silently skipped. */
export function runRules(ctx, { only, skip = [] } = {}) {
  const results = [];
  for (const r of RULES) {
    if ((only && !only.includes(r.id) && !only.includes(r.cat)) || skip.includes(r.id)) continue;
    let findings;
    try {
      findings = r.check(ctx);
    } catch (e) {
      findings = [{ url: "-", detail: `RULE CRASHED: ${e.message}` }];
    }
    const seen = new Set();
    findings = findings.filter((f) => !seen.has(f.url + f.detail) && seen.add(f.url + f.detail));
    if (findings.length) results.push({ id: r.id, cat: r.cat, severity: r.severity, tr: r.tr, en: r.en, findings });
  }
  // A deliberately closed site (staging): per-page consequences of the switch are noise, keep only the site finding.
  if (results.some((r) => r.id === "site-closed")) {
    const noise = new Set(["sitemap-not-indexable", "sitemap-robots-blocked", "search-bot-blocked", "noindex-linked"]);
    for (let i = results.length - 1; i >= 0; i--) if (noise.has(results[i].id)) results.splice(i, 1);
  }
  return results.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || b.findings.length - a.findings.length);
}
