# Topic clusters: one query per page, hubs that link down

## One page, one primary query
- Give every indexable page exactly one primary query (its job). Keep the mapping in a simple sheet:
  URL → primary query → intent (do / know / compare / navigate) → hub it belongs to.
- Two pages on one primary query compete. The GSC cannibalisation report (`gsc.mjs report`) shows where this already
  happens. Same intent → merge into the stronger page and 301 the other; different intents → sharpen titles, H1 and
  the first paragraph so each answers its own question, and link them to each other.
- A tool and its "how is it calculated" article are two intents. Keep both, cross-link them.

## Hub and spoke
- A hub (category / pillar) page answers the broad query briefly and links to every spoke with a descriptive anchor.
- Each spoke links back to the hub and to 2-3 sibling spokes where a reader would actually go next.
- Links belong in the body text and in "related" blocks, not only in the menu: `inbound-chrome-only` lists pages that
  get only nav/footer links; `click-depth` lists pages more than 4 clicks from home.

## New pages
- On publish day a new page gets at least 3 contextual internal links from relevant, already-indexed pages (and the
  hub), plus its sitemap entry with a true `lastmod`.
- Before writing, check the sheet: if a page already owns the query, improve that page instead.

## Review cadence
- Monthly: re-run the cannibalisation report and the crawl (`--only links`), update the sheet, fix new overlaps.
- Pages with zero impressions after 90 days (`gsc.mjs zero`): improve, merge into the hub/spoke that owns the topic,
  or remove. Do not keep thin spokes "for the cluster".
