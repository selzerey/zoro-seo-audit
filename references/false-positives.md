# False positives: verify before fixing

Generic audit tools (and our own heuristics) raise alarms that are wrong for a given site. Before changing code for any
finding, confirm it on the live page. Each item below cost real time once.

## Robots / indexing
- `max-snippet:-1` = **unlimited** snippet, not "blocks snippets". `max-image-preview:large` is good. Only `nosnippet`,
  `max-snippet:0`, `noindex`, `none` restrict.
- Crawler fetched `https://site.com/page` (no slash) and got 301/308 to `/page/`: not a canonical problem if every
  canonical and internal link already uses one form. Check canonicals + internal hrefs, not the crawler's input URL.
- `noindex` pages (search results, admin, thank-you, print) need no canonical, no description, no H1 work.
- Bot challenge (Cloudflare/WAF) on a datacenter IP: 403/503 + challenge HTML. Results for those pages are void. Rerun
  from a residential IP or allowlist the audit UA; never "fix" pages because of challenge responses.

- Whole site noindex on staging/preview (robots `Disallow: /` + noindex): that is the pre-launch switch, not a bug;
  `site-closed` reports it once. Audit with indexing opened on staging to see real findings.
- Query-string URLs in a sitemap (`/list/?g=f`) are fine when the page is a deliberate, self-canonical landing page
  with its own title; `sitemap-query-url` is info only.
- Near-duplicate titles on templated pages ("X isminin anlamı nedir") are not cannibalisation; the rule drops words
  shared by >15 % of titles before comparing.

## Dates
- `Dataset`, `Event`, `Offer` `dateModified`/dates describe the data (e.g. tax rates valid from Jan 1), not the page.
  Mismatch with sitemap `lastmod` is correct there.
- Sitemap `lastmod` should change only when main content changes. Bumping it on every deploy erodes Google's trust in it.

## Structured data
- `BlogPosting` items inside `Blog.blogPost` / `ItemList` on a listing page are summaries; they need no author/image.
  Only the page's own top-level Article needs full fields.
- FAQPage/HowTo: valid markup, but since 2023 FAQ rich results show only for well-known government/health sites and
  HowTo rich results are gone. Do not add them for traffic; no need to rip them out either.
- `aggregateRating` must match a rating visible on the page; self-serving ratings on Organization/LocalBusiness are
  ignored by Google.

## Images and performance
- `loading="lazy"` is wrong only for the image visible in the first screen (LCP). An image deep in an article body is
  correctly lazy. Confirm with a 1280 px and 390 px screenshot / Lighthouse LCP element before changing.
- "HTML too large" on server-rendered React/Next pages: RSC/hydration payload inflates bytes. Act only if LCP/INP field
  data (CrUX / Search Console CWV) is poor.
- `alt=""` is correct for decorative images. Missing alt *attribute* is the real issue.
- Inline SVG icon sprites, DOM > 800 nodes: Lighthouse advice, not a ranking factor. Fix only with measured INP issues.

## Links and trust pages
- "No privacy/about/contact link": many tools match only English words. Check Turkish (Gizlilik, Hakkımızda, İletişim,
  Künye, KVKK) and other languages before believing it.
- "Unreachable external link" to government sites (`*.gov.tr`, mevzuat, Resmî Gazete): they block bots. Open in a
  browser before removing a source link.
- Honeypot form fields (`name="website"`, hidden) without labels are intentional anti-spam.
- A switch/button labelled by `<label for=id>` has an accessible name even if a tool says "no name".

## Content
- Thin-content flags on calculators, tools, category hubs, contact pages: word count is not the goal; usefulness is.
- Reading-level scores (Flesch etc.) are English formulas; meaningless for Turkish.
- Link density "too high" on hub/category pages is their job.

## SERP-based data
- Since Sep 2026 Google serves **poisoned SERPs** to scrapers (Nozzle research): full-looking pages with wrong results,
  5-11% of scraped SERPs. Rank trackers show fake drops that recover within ~3 days. Confirm any drop with Search
  Console impressions/clicks before acting. See `gsc-loop.md`.

## Not worth acting on (2026)
- `llms.txt`, `AGENTS.md`, `.well-known` agent manifests, Markdown twins of pages: no search engine uses them for
  ranking or citation selection. Optional, low priority.
- HSTS preload, Trusted Types, strict CSP: security hardening, not SEO. Schedule separately; a strict CSP can break
  analytics/ads.
- Consent Mode warnings: legal/analytics topic, not ranking.
