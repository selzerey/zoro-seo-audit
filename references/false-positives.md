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

## AI search / GEO rules
- `schema-required-props` / `schema-recommended-props`: Organization/Person/WebSite are merged per `@id` over the
  crawl, so a short reference copy is fine if the full node is on a crawled page (home/about). If the full node lives
  on an uncrawled page, raise `--max` before believing it. `sameAs` = real, owned profiles only; none → leave it out.
- The Article suggestion skips tools, terms, listings, datasets, about/contact and FAQ pages (`NOT_ARTICLE_TYPES`).
  A long page with only `WebPage` may still be a hub, not an article: decide by what the page is.
- `freshness-missing`: tools, categories, legal and contact pages need no date. Act only on time-sensitive articles
  (rates, laws, yearly lists) among the examples.
- `content-extractability`: an empty `#app`/`#root` used as a modal/portal mount next to server-rendered content is
  not flagged (body text ≥ 1200 chars). Confirm a real hit with `curl` — the text must be missing from raw HTML.
- `citability`: word counts skip tables and lists. Glossary, legal and reference pages may legitimately run long
  under one heading. Sentence split is heuristic: a period followed by a lower-case word is not a sentence end, so
  text without capitals after periods reads as fewer, longer sentences.
- `llms-txt` missing: optional, no search engine ranks with it. Only fix format/broken links when the file exists.
- `https-hsts`: security hardening; no ranking effect. Silent on http and localhost. Add `preload` only on purpose.
- `feed-missing` needs ≥3 article pages; a feed linked only from the blog index (not crawled) still counts as missing
  — check the blog index `<head>`. `twitter-card-missing`: X falls back to og tags for a small card only.

## Leaks and encoding
- `placeholder-leak` reads only visible text: `<pre>`, `<code>`, `<kbd>`, `<samp>`, `<var>`, `<textarea>`, scripts,
  JSON-LD, `<del>`/`<s>` and `[hidden]` are skipped, so a tutorial showing `{{ name }}` or `${x}` in a code block is
  fine. `undefined`/`null` count only as a whole value (alone in a line or table cell, or next to a number, ₺, $, €,
  %, TL); "null hypothesis" in prose is not a leak. `TODO` needs a following `:` or `(` (Spanish "TODO" = "all").
  `{word}` in prose is reported: a page that explains a template in running text ("write {ad} here") should put the
  sample in `<code>`. Exact shortcode names can be listed with `--placeholders` / `ZORO_PLACEHOLDERS`.
- `markdown-leak`: single stars (footnotes, "Fiyat*") never count, one `**bold**` pair is ignored (two or more are
  reported), `std::vector` and times like `10:30` do not match the `::block` pattern.
- `mojibake` needs two hits. Turkish letters (ç ğ ı İ ö ş ü â î û), German Ä and Portuguese "SÃO" do not match:
  only Ã/Ä/Å followed by a Latin-1/Windows-1252 continuation character, `â€` and U+FFFD do. A single U+FFFD may be a
  broken emoji in user content.
- `charset-missing` is silent when the `Content-Type` header carries `charset=`; the header wins over the meta tag.

## Stale values
- `stale-fact` is silent without a list (`--stale-file`, `ZORO_STALE_FILE`, `ZORO_STALE_VALUES`). A value is skipped
  when its line (a table row is one line) or the section heading above it holds an earlier year, or the line uses
  history wording (önceki, eski, geçmiş, tarihçe, iken, idi, previous, former). Year-by-year tables are therefore
  quiet. A sentence that mentions the old value without a year ("eskiden 17.002 TL'ydi" written another way) can
  still be reported: read the line before editing. Number boundaries are strict (`17.002,12` does not match inside
  `117.002,12`).

## robots.txt and directives
- `robots-missing` = 4xx (harmless: everything allowed). `robots-unreachable` = 5xx, 429 or no answer (serious:
  Google stops crawling). A local dev server restarting mid-audit can produce a one-off 5xx; re-run before acting.
- `robots-syntax` knows `Content-Signal`, `Content-Usage`, `Crawl-delay`, `Host`, `Clean-param` (Yandex) as valid.
  A BOM at the start is accepted.
- `content-signal-conflict`: Cloudflare's default `search=yes, ai-train=no` is not a conflict, and a managed block
  that only blocks training bots (GPTBot, ClaudeBot, CCBot…) is a choice, not a conflict. The live file is what
  counts: Cloudflare can add its block at the edge, so the repository's robots.txt may look clean.
- `robots-blocks-assets` checks same-host assets only; another host (CDN) has its own robots.txt.
- `snippet-restricted`: `max-snippet:-1` is unlimited (fine). `X-Robots-Tag: otherbot: nosnippet` does not apply to
  Googlebot. `data-nosnippet` on a small box (price note, ad) is fine; the rule needs ≥ 50 % of the main text.
- `robots-directive-conflict` reports only opposite pairs (index/noindex, follow/nofollow, all/none). The same
  `noindex` in two places is redundant, not a conflict.

## Canonical, head and 404
- `canonical-noindex-conflict` "noindex + canonical → X": parameter variants (`?a=…`, `?sayfa=2`) are often made
  noindex *and* canonicalised on purpose. Google treats the pair as contradictory and picks one; the risk is small
  but real (the noindex can be carried to X). Keep one signal: either a canonical to X, or noindex with a
  self-canonical. "Canonical target is noindex" is always worth fixing: the canonical points at a page that cannot
  be indexed. Findings are grouped per target.
- `canonical-outside-head` / `head-invalid-element` read the raw HTML. Frameworks that stream metadata into
  `<body>` for non-bot user agents (some Next.js versions) can show these to the audit UA but not to Googlebot:
  re-fetch with `--ua` set to a Googlebot string from your own machine and compare before changing templates.
- `head-invalid-element` lists only critical tags after the break (canonical, robots, hreflang, description, title).
  `<noscript>` holding only `<link>`, `<style>` or `<meta>` is valid; a GTM `<noscript><iframe>` belongs in `<body>`.
- `soft-404`: the probe asks for a random `/zoro-yok-…` path once. A 301/308 to the same path with a slash that then
  answers 404 is correct. Per page, only short indexable pages whose title or H1 says "not found" count; noindex
  search pages with "Sonuç bulunamadı" and long articles about 404 errors are skipped.

## Dates
- `sitemap-lastmod-uniform` needs ≥ 20 dated URLs and ≥ 90 % on one day. A site that really published everything in
  one launch day matches too: check whether the date moves on the next deploy. `datemodified-uniform` needs ≥ 10
  pages and skips Dataset/Event/Offer dates.

## Links and architecture
- `link-dev-host`: the audited host is never a leak, so a local audit of `http://localhost:3401/` does not flag its
  own `localhost:3401` links (nor `127.0.0.1:3401`). Another port (`localhost:3000`, `:3400`) is reported: it points
  at a different server. In a local audit this is often an environment variable (base URL) mismatch; check whether
  the production build uses the same variable before calling it a production bug. Sitemaps are checked too.
  Addresses inside `<pre>`/`<code>` are skipped. Add your preview platforms with `--dev-hosts` / `ZORO_DEV_HOSTS`.
- `link-not-crawlable` sees only what is in the HTML: React/Vue click handlers are not attributes, so pure-JS
  navigation can be missed. `<button onclick>` that opens a menu and `<a href="/x" onclick="track()">` are fine.
- `internal-link-tracking-params`: pagination, filters and search queries are not tracking; only utm_*, click ids
  (gclid, fbclid, msclkid…) and session ids count.
- `click-depth` is reported only for depths the crawl saw completely (every link target of the shallower layers was
  crawled). With `--max` far below the site size it stays silent; raise `--max` to measure depth.
- `inbound-chrome-only` counts nav, header, footer and aside as chrome. On a partial crawl a page needs nav links from
  ≥ 3 crawled pages to be reported (one prev/next link says nothing); on a full crawl (≥ 90 % of the sitemap) every
  page counts. Legal/contact/help paths and hubs (≥ 30 contextual links out, CollectionPage) are skipped.
- `bot-wall` groups identical noindex screens only when they are short (< 150 words): a JavaScript-filled noindex
  tool page (`?a=x`) can be byte-identical across URLs without being a challenge.

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
