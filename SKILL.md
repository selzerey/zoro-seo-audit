---
name: zoro-seo-audit
description: This skill should be used for SEO audits of live sites - crawl, indexing, schema, GSC/Bing reports, cannibalisation, pruning, IndexNow, AI crawler access.
license: MIT
version: 0.1.0
---

# Zoro SEO Audit

Audit a live site with verified, low-noise rules, then act on Search Console and Bing data. Built from real site
work: every rule exists because it found a real problem, and known false alarms are suppressed or documented.

## When to use
- "Audit / check SEO of <site>", after a large deploy, before a launch.
- "Why is page X not indexed / ranking?", "which pages compete?", "what should I prune?", "what to improve next?".
- Submitting new URLs (IndexNow), checking AI crawler access.

## Setup
- Node ≥ 20. Run `npm install` once in the skill folder.
- API keys (only for GSC/Bing/IndexNow): `references/api-setup.md`, template `.env.example`.

## Workflow
1. **Crawl audit**
   `node scripts/audit.mjs https://example.com/ --max 100 --out audit.md`
   Options: `--format json`, `--lang en`, `--only technical,schema`, `--skip rule-id`, `--concurrency 2 --delay 300`
   (small hosts), `--check-links 1000`, `--ua "..."`.
   Severities: `error` fix now · `warn` should fix · `info` judge case by case.
2. **Verify before fixing.** Open each error/warn on the live page (curl the HTML, screenshot at 1280 and 390 px for
   visual issues). Read `references/false-positives.md` — it lists alarms that look real but are not.
3. **Fix at the source.** Find the template/component that renders the issue; fix once for all pages. Re-run the
   audit with `--only <rule-id>` to confirm.
4. **Search data loop** (needs keys): `references/gsc-loop.md`
   - `node scripts/gsc.mjs report --site sc-domain:example.com --brand brandname --out gsc.md`
     → cannibalisation, striking distance (pos. 4-20), low CTR on page 1.
   - `node scripts/gsc.mjs inspect --site ... <url>` → index verdict + Google canonical.
   - `node scripts/gsc.mjs zero --site ... --sitemap <sitemap url>` → pruning candidates (90 days, 0 impressions).
   - `node scripts/bing.mjs queries|pages --site https://example.com/` → Bing/Copilot demand.
5. **Notify** new or changed URLs: `node scripts/indexnow.mjs submit --host example.com <urls>` (Bing/Yandex).
   Google: correct sitemap `lastmod`; manual "Request indexing" only for a few key URLs.
6. **Report** to the user in their language: what was found, what was verified as real, what was fixed, what is
   left with a reason. Never report raw tool output as findings.

## Rules (scripts/lib/rules/)
| Category | Rules |
|---|---|
| site | host-normalisation, robots-missing, robots-no-sitemap, search-bot-blocked, ai-bot-access, bot-wall |
| technical | status-error, redirect-chain, canonical-missing/-multiple/-relative/-target-bad/-elsewhere, sitemap-not-indexable, sitemap-robots-blocked, sitemap-missing, sitemap-lastmod-future, noindex-linked, lang-missing, mixed-content, slow-response |
| links | internal-link-broken, internal-link-redirect, internal-nofollow, link-empty-text, weak-inbound, sitemap-orphan |
| onpage | title-missing/-duplicate/-long, description-missing/-duplicate/-long, h1-missing/-multiple, img-alt-missing, img-no-dimensions, lcp-image-lazy, og-image-missing |
| schema | jsonld-invalid, article-fields, author-fake-risk, date-future, date-order, sitemap-lastmod-drift, org-id-inconsistent, breadcrumb-positions, faq-howto-note |
| content | thin-content, near-duplicate, ai-cliches (TR + EN) |

Add a rule: one object `{ id, severity, tr, en, check(ctx) → [{url, detail}] }` in the matching file, plus a case in
`scripts/tests/crawl.test.mjs` (a planted problem it must find and, if relevant, a trap it must ignore).

## References
- `references/false-positives.md` — read before acting on any finding
- `references/gsc-loop.md` — weekly/monthly Search Console + Bing routine, indexing checks
- `references/content-quality.md` — honest E-E-A-T, AI text clean-up, YMYL sourcing
- `references/schema-guide.md` — which structured data matters, entity `@id` pattern
- `references/ai-search.md` — AI crawler access, citation-friendly writing, measuring AI visibility
- `references/api-setup.md` — Google/Bing/IndexNow keys

## Guardrails
- Ground truth = Search Console / Bing data for the site. Scraped SERPs can be poisoned (Sep 2026+); never act on a
  rank-tracker drop alone.
- Do not invent authors, reviews, ratings or credentials to "improve E-E-A-T".
- Ask before mass changes (redirects, deletions, noindex on many URLs); back up before bulk edits.
- Crawl politely; own sites or with permission only.

## Tests
`npm test` — unit tests + a local fake-site crawl (no network).
