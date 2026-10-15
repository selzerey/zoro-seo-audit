# Search Console loop (weekly)

Ground truth is Search Console / Bing Webmaster data for the site itself. Scraped rank data is a hint only
(poisoned SERPs since Sep 2026, see false-positives.md).

## Every week
1. `node scripts/gsc.mjs report --site sc-domain:<domain> --days 28 --brand <brand,variants> --out gsc.md`
2. Read in this order:
   - **Cannibalisation**: two+ pages share one query. Decide one target page per intent.
     - Same intent, weaker page has little unique value → merge content into target, 301 the weak URL, update
       internal links and sitemap.
     - Different intents (e.g. calculator vs. "how it is calculated" article) → sharpen titles/H1/intro so each answers
       its own intent; link the two to each other with descriptive anchors.
   - **Striking distance (pos. 4-20)**: cheapest wins. Answer the query in the first 2-3 sentences (a short summary box
     works), put the term in an H2, add 2-3 internal links from strong related pages, refresh facts/dates.
   - **Low CTR on page 1**: rewrite title/description for the query intent (number, year, concrete benefit). Do not
     clickbait; Google rewrites misleading titles.
3. Log decisions (date, page, change). Re-check the same queries 14 days later, not sooner.

## Monthly
- `node scripts/gsc.mjs zero --site ... --sitemap https://<domain>/sitemap.xml --days 90`
  Pages with 0 impressions in 90 days (and older than 90 days): improve, merge (301), or remove (410) and drop from
  sitemap. Keep seasonal pages and pages that serve users from navigation. Pruning dead weight helps crawl focus.
- `node scripts/gsc.mjs sitemaps --site ...`: errors, submitted vs. indexed (the indexed count lags; use URL inspection
  for truth).
- Bing: `node scripts/bing.mjs queries --site https://<domain>/` + `pages`. Bing feeds ChatGPT search and Copilot,
  so queries here show what AI assistants are asked. Check the AI Performance report in the Bing UI.

## Indexing checks
- `node scripts/gsc.mjs inspect --site ... <url> ...` → verdict, coverage, Google canonical, last crawl.
- The **Live test** screen in the GSC UI always shows "Google-selected canonical" empty; that is normal. Use the
  "Google index" tab or the API for the real canonical.
- "Crawled - currently not indexed" on a young site is normal for weeks. Improve uniqueness and internal links; do
  not spam "Request indexing".
- New or truly changed URLs: IndexNow (Bing/Yandex) via `scripts/indexnow.mjs submit`; Google via sitemap lastmod.

## Young site expectations (first 3 months)
- Brand queries first, then long-tail. Blog/guide content usually earns impressions before tool pages.
- Don't judge pages before 7-14 days of data. Don't rewrite pages weekly; let changes settle.

## Data notes
- GSC data lags 2-3 days; the scripts end the window 3 days ago.
- Query+page rows hide anonymised queries; totals from the page dimension are higher. Compare like with like.
- Position is an impression-weighted average; a page jumping between 3 and 30 averages ~15. Look at per-query rows.
