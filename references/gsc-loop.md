# Search Console loop (weekly)

Ground truth is Search Console / Bing Webmaster data for the site itself. Scraped rank data is a hint only
(poisoned SERPs since Sep 2026, see false-positives.md).

## Every week
1. `node scripts/gsc.mjs report --site sc-domain:<domain> --days 28 --brand <brand,variants> --out gsc.md`
2. Read in this order:
   - **Suspect queries** (listed first, excluded from the rest): very many impressions, almost no clicks, page 1.
     That pattern is rank trackers / scrapers, not people (seen Oct 2026: hundreds of thousands of impressions,
     ~0 clicks, all gone the day Google tightened anti-scraping). Confirm in the GSC UI; do not "fix" the page's
     title for them. `--keep-suspects` disables the filter.
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
  for truth), and index children not submitted on their own. Submit every major child sitemap (products, categories,
  articles, help) as well as the index: the Page indexing report can then be filtered per child ("Submitted pages
  only"), which is how you see whether "Crawled - currently not indexed" sits in products or in tag archives.
- `node scripts/cwv.mjs https://<domain>/ --origin` (needs `CRUX_API_KEY`): LCP / INP / CLS field data, the same
  numbers as the Core Web Vitals report. Page-level data exists only for pages with enough visitors.
- Bing: `node scripts/bing.mjs queries --site https://<domain>/` + `pages`. Bing feeds ChatGPT search and Copilot,
  so queries here show what AI assistants are asked. Check the AI Performance report in the Bing UI.

## Indexing checks
- `node scripts/gsc.mjs inspect --site ... <url> ...` → verdict, coverage, Google canonical, last crawl.
- **A change is not visible yet?** Look at *last crawl* before judging it. Google's own typical timelines (Search
  Central, Oct 2026): discovering a new page ~20 hours, recrawling an existing page ~30 days, a title update in
  results 1-2 days *after* the crawl, link signals minutes to 3 weeks, a site migration 1-3 months, recovery after a
  core update 3-6 months. The steps stack: an edit indexed in hours still waits for the next crawl.
- The **Live test** screen in the GSC UI always shows "Google-selected canonical" empty; that is normal. Use the
  "Google index" tab or the API for the real canonical.
- "Crawled - currently not indexed" on a young site is normal for weeks. Improve uniqueness and internal links; do
  not spam "Request indexing".
- New or truly changed URLs: IndexNow (Bing/Yandex) via `scripts/indexnow.mjs submit`; Google via sitemap lastmod.

## Young site expectations (first 3 months)
- Brand queries first, then long-tail. Blog/guide content usually earns impressions before tool pages.
- Don't judge pages before 7-14 days of data. Don't rewrite pages weekly; let changes settle.

## Data notes
- GSC data lags 2-3 days; the scripts end the window 3 days ago. The Performance report is sometimes delayed by
  several days (Oct 2026: 60+ hours); a flat line at the end of the window is the delay, not a drop.
- Search Console performance data is attributed to the **canonical** URL Google chose, so a wrong canonical moves
  a page's clicks to another URL in the report.
- The **Generative AI performance** report (AI Overviews + AI Mode impressions, by page, country and device) is in
  the GSC UI only; the API's `searchType` has no value for it and the impressions are already inside `web` totals.
- Query+page rows hide anonymised queries; totals from the page dimension are higher. Compare like with like.
- Position is an impression-weighted average; a page jumping between 3 and 30 averages ~15. Look at per-query rows.
