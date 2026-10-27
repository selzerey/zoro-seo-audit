---
name: zoro-seo-audit
description: Audits a live website for SEO problems with few false alarms - crawl and indexing (status, redirects, canonical, robots.txt, sitemaps, soft 404), hreflang, structured data, on-page tags, internal links, content leaks and AI-search readiness - and turns Google Search Console and Bing Webmaster data into cannibalisation, striking-distance and pruning lists (scraper-like queries filtered out); Core Web Vitals field data from CrUX; submits new URLs with IndexNow. Use when the user asks to audit or check a site's SEO, after a big deploy or before a launch, asks why a page is not indexed or ranking, which pages compete, what to prune or improve next, or wants to submit URLs or check AI crawler access. Not for keyword research or writing content from scratch.
license: MIT
compatibility: Requires Node.js 20+ and network access to the audited site. Search Console, Bing and IndexNow features need the user's own API keys.
metadata:
  version: "1.1.0"
  author: selzerey
  homepage: https://github.com/selzerey/zoro-seo-audit
---

# Zoro SEO Audit

Audit a live site with narrow, verified rules, then act on the site's own Search Console and Bing data. Every rule
exists because it found a real problem on a real site; alarms that look real but are not are documented in
`references/false-positives.md`.

All commands below run from this skill's folder (the folder that contains this file). No `npm install` is needed:
the scripts use only Node.js built-ins and a bundled HTML parser.

## When to use
- "Audit / check the SEO of <site>", after a large deploy, before a launch or a migration.
- "Why is page X not indexed / not ranking?", "which pages compete?", "what should I prune?", "what next?".
- Multilingual sites (hreflang), structured data checks, AI crawler access, submitting new URLs (IndexNow).

## Workflow
1. **Crawl audit** (no keys needed)
   `node scripts/audit.mjs https://example.com/ --max 100 --out audit.md`
   - `--format json` for machine-readable output, `--lang en|tr` for the report language (default `en`).
   - `--only technical,schema` or `--only hreflang-no-return`, `--skip rule-id`.
   - Small or shared hosting: `--concurrency 2 --delay 300`. Bigger crawls: `--max 500 --check-links 1000`.
   - Optional lists: `--stale-file old-values.txt`, `--placeholders year,site_name`, `--dev-hosts vercel.app`.
   - Severities: `error` fix now · `warn` should fix · `info` judge case by case.
   - A staging site closed with robots `Disallow: /` + noindex gives one `site-closed` finding and drops the
     per-page noise. To see what search engines *will* see, open indexing on staging first.
2. **Verify before fixing.** Open each error/warn on the live page (fetch the HTML; screenshot at 1280 and 390 px
   for visual issues). Read `references/false-positives.md` first — it lists alarms that look real but are not.
3. **Fix at the source.** Find the template/component that renders the issue and fix it once for all pages. Re-run
   with `--only <rule-id>` to confirm.
4. **Search data loop** (needs keys, see Setup) — details in `references/gsc-loop.md`
   - `node scripts/gsc.mjs report --site sc-domain:example.com --brand brandname --out gsc.md`
     → cannibalisation, striking distance (positions 4-20), low CTR on page 1. Scraper-like queries (huge
     impressions, ~0 clicks, page 1) are listed apart and excluded; `--keep-suspects` keeps them.
   - `node scripts/gsc.mjs inspect --site sc-domain:example.com <url>` → index verdict and Google-chosen canonical.
   - `node scripts/gsc.mjs zero --site sc-domain:example.com --sitemap <sitemap url>` → pruning candidates.
   - `node scripts/gsc.mjs sitemaps --site sc-domain:example.com` → submitted sitemaps and index children that
     should be submitted on their own (per-section Page indexing filter).
   - `node scripts/cwv.mjs <url> [--origin]` → Core Web Vitals field data (CrUX): LCP, INP, CLS p75 and ratings.
   - `node scripts/bing.mjs queries|pages --site https://example.com/` → Bing / Copilot demand.
5. **Notify** new or changed URLs: `node scripts/indexnow.mjs submit --host example.com <urls>` (Bing, Yandex,
   Seznam, Naver). Google: keep sitemap `lastmod` correct; request indexing by hand only for a few key URLs.
6. **Report** to the user in the user's language: what was found, what was verified as real, what was fixed, and
   what is left with a reason. Never paste raw tool output as findings.

## Setup (only for Search Console / Bing / IndexNow / CrUX)
- Ask the user to run `npx zoro-seo-audit setup` in a terminal (interactive; saves to
  `~/.config/zoro-seo-audit/.env`), or follow `references/api-setup.md`. Never ask the user to paste keys into chat.
- `node cli/zoro-seo-audit.mjs doctor` (or `npx zoro-seo-audit doctor`) shows which settings are found, without
  printing values.

## Rules (scripts/lib/rules/)
| Category | Rules |
|---|---|
| site | site-closed, favicon-missing, favicon-blocked, host-normalisation, robots-missing, robots-unreachable, robots-syntax, robots-blocks-assets, robots-no-sitemap, content-signal-conflict, soft-404, search-bot-blocked, ai-bot-access, bot-wall, llms-txt, https-hsts, feed-missing |
| technical | status-error, redirect-chain, canonical-missing / -multiple / -relative / -target-bad / -elsewhere, canonical-header-conflict, canonical-outside-head, canonical-noindex-conflict, canonical-chain, head-invalid-element, head-duplicate-meta, charset-missing, viewport-missing, snippet-restricted, robots-directive-conflict, sitemap-not-indexable, sitemap-robots-blocked, sitemap-missing, sitemap-lastmod-future, sitemap-lastmod-uniform, sitemap-query-url, noindex-linked, lang-missing, mixed-content, slow-response, content-extractability |
| hreflang | hreflang-invalid, hreflang-conflict, hreflang-self-missing, hreflang-no-return, hreflang-target-bad |
| links | internal-link-broken, internal-link-redirect, internal-nofollow, link-empty-text, link-not-crawlable, link-dev-host, internal-link-tracking-params, inbound-chrome-only, click-depth, sitemap-orphan |
| onpage | title-missing / -duplicate / -near-duplicate / -no-brand / -long, description-missing / -duplicate / -long, h1-missing / -multiple, img-alt-missing, img-no-dimensions, lcp-image-lazy, og-image-missing, twitter-card-missing, hidden-keyword-repetition |
| schema | jsonld-invalid, article-fields, author-fake-risk, date-future, date-order, sitemap-lastmod-drift, datemodified-uniform, org-id-inconsistent, breadcrumb-positions, page-entity-missing, schema-dangling-id, faq-howto-note, schema-required-props, schema-recommended-props |
| content | placeholder-leak, markdown-leak, mojibake, stale-fact (needs a list), thin-content, near-duplicate, ai-cliches, freshness-missing, citability |

Language-aware rules (AI clichés, sentence splitting, "not found" wording, legal-page slugs, past-tense context)
use the page's `<html lang>`: built-in packs for English, Turkish, German, French, Spanish, Italian, Portuguese,
Dutch, Polish and Russian (`scripts/lib/lang.mjs`); other languages fall back to Unicode sentence and word
segmentation (Japanese, Chinese, Thai and others work). AI-search rules (llms-txt, citability, content-extractability,
schema props) are hints, not ranking factors; their limits are in `references/false-positives.md`.

Add a rule: one object `{ id, severity, tr, en, check(ctx) → [{ url, detail }] }` in the matching file plus a test in
`scripts/tests/` (a planted problem it must find and, where relevant, a trap it must ignore).

## References
- `references/false-positives.md` — read before acting on any finding
- `references/gsc-loop.md` — weekly / monthly Search Console + Bing routine, indexing checks
- `references/content-quality.md` — honest E-E-A-T, AI text clean-up, YMYL sourcing
- `references/schema-guide.md` — which structured data matters, entity `@id` pattern
- `references/ai-search.md` — AI crawler access, citation-friendly writing, measuring AI visibility
- `references/ai-visibility.md` — fixed question set, monthly assistant check, honest reporting language
- `references/competitor-serp.md` — read the top results for one query, coverage table, format match
- `references/topic-clusters.md` — one primary query per page, hub/spoke links, linking new pages
- `references/eeat-checklist.md` — yes / partly / no / unclear review with evidence, YMYL trust items, no scores
- `references/api-setup.md` — Google, Bing and IndexNow keys

## Guardrails
- Ground truth is the site's own Search Console / Bing data. Scraped SERPs can be manipulated; never act on a
  rank-tracker drop alone.
- Do not invent authors, reviews, ratings or credentials to "improve E-E-A-T".
- Ask before mass changes (redirects, deletions, noindex on many URLs); back up before bulk edits.
- Crawl politely, and only sites the user owns or has permission to audit.
- Never print, log or commit API keys or tokens.
