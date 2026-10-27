// Pure analysis over Search Console rows ({ keys: [...], clicks, impressions, ctr, position }). Tested without network.

/**
 * Queries where two or more pages share the impressions: the pages compete for one intent.
 * A page counts when it has >= minShare of the query's impressions. Brand queries can be excluded.
 */
export function cannibalisation(rows, { minImpressions = 30, minShare = 0.15, exclude = [] } = {}) {
  const byQuery = new Map();
  for (const r of rows) {
    const [query, page] = r.keys;
    if (exclude.some((x) => query.includes(x))) continue;
    const q = byQuery.get(query) ?? { query, impressions: 0, clicks: 0, pages: [] };
    q.impressions += r.impressions;
    q.clicks += r.clicks;
    q.pages.push({ page, impressions: r.impressions, clicks: r.clicks, position: r.position });
    byQuery.set(query, q);
  }
  return [...byQuery.values()]
    .filter((q) => q.impressions >= minImpressions)
    .map((q) => ({ ...q, pages: q.pages.filter((p) => p.impressions / q.impressions >= minShare).sort((a, b) => b.impressions - a.impressions) }))
    .filter((q) => q.pages.length >= 2)
    .sort((a, b) => b.impressions - a.impressions);
}

/** Expected CTR by position (rough 2025-26 organic curve with AI Overviews); only used to spot outliers. */
export function expectedCtr(position) {
  const curve = [0.27, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];
  const i = Math.max(1, Math.round(position)) - 1;
  return i < curve.length ? curve[i] : 0.01;
}

/** Queries on page 1 bottom / page 2 (positions 4-20) with enough impressions: the cheapest wins. */
export function strikingDistance(rows, { minImpressions = 50, from = 4, to = 20 } = {}) {
  return rows
    .filter((r) => r.position >= from && r.position <= to && r.impressions >= minImpressions)
    .map((r) => ({ query: r.keys[0], page: r.keys[1], impressions: r.impressions, clicks: r.clicks, position: +r.position.toFixed(1) }))
    .sort((a, b) => b.impressions - a.impressions);
}

/** Pages ranking well but clicked far less than the position predicts: title/description rewrite candidates. */
export function lowCtr(rows, { minImpressions = 100, ratio = 0.5 } = {}) {
  return rows
    .filter((r) => r.impressions >= minImpressions && r.position <= 10 && r.ctr < expectedCtr(r.position) * ratio)
    .map((r) => ({ page: r.keys[0], impressions: r.impressions, ctr: +(r.ctr * 100).toFixed(2), expected: +(expectedCtr(r.position) * 100).toFixed(1), position: +r.position.toFixed(1) }))
    .sort((a, b) => b.impressions - a.impressions);
}

/**
 * Sitemap URLs with no impressions in the window. Only a pruning *candidate* list: young pages (check lastmod /
 * publish date, < 90 days) and seasonal pages are expected to be here. Decide per page: improve, merge (301) or keep.
 */
export function zeroImpression(sitemapUrls, pageRows) {
  const seen = new Set(pageRows.map((r) => r.keys[0]));
  return sitemapUrls.filter((u) => !seen.has(u));
}

/**
 * Pages Search Console reports under several spellings of one URL (trailing slash, case, query string, http/www).
 * Usually historic (before a redirect existed) and self-healing once the variant redirects; if a variant still
 * answers 200, fix the redirect/canonical.
 */
export function urlVariants(pageRows) {
  const norm = (u) => {
    const x = new URL(u);
    return (x.host.replace(/^www\./, "") + x.pathname.replace(/\/+$/, "")).toLowerCase();
  };
  const groups = new Map();
  for (const r of pageRows) {
    const k = norm(r.keys[0]);
    groups.set(k, [...(groups.get(k) ?? []), { page: r.keys[0], impressions: r.impressions, clicks: r.clicks }]);
  }
  return [...groups.values()].filter((g) => g.length > 1).sort((a, b) => b.reduce((s, x) => s + x.impressions, 0) - a.reduce((s, x) => s + x.impressions, 0));
}

/**
 * Query rows that look like scraper / rank-tracker traffic rather than people: very many impressions, almost no
 * clicks, on page 1. Such queries inflate impressions and drag CTR down (Lily Ray, Oct 2026: hundreds of thousands
 * of impressions, ~0 clicks, all gone the day Google tightened anti-scraping). They are excluded from the other
 * lists and reported separately so a human can confirm.
 */
export function suspectQueries(rows, { minImpressions = 1000, maxCtr = 0.002, maxPosition = 10 } = {}) {
  const byQuery = new Map();
  for (const r of rows) {
    const [query, page] = r.keys;
    const q = byQuery.get(query) ?? { query, impressions: 0, clicks: 0, posSum: 0, pages: new Set() };
    q.impressions += r.impressions;
    q.clicks += r.clicks;
    q.posSum += r.position * r.impressions;
    if (page) q.pages.add(page);
    byQuery.set(query, q);
  }
  return [...byQuery.values()]
    .filter((q) => q.impressions >= minImpressions && q.clicks / q.impressions <= maxCtr && q.posSum / q.impressions <= maxPosition)
    .map((q) => ({ query: q.query, impressions: q.impressions, clicks: q.clicks, position: +(q.posSum / q.impressions).toFixed(1), pages: [...q.pages] }))
    .sort((a, b) => b.impressions - a.impressions);
}

/** Query+page rows without the suspect queries. */
export function withoutQueries(rows, suspects) {
  const bad = new Set(suspects.map((s) => s.query));
  return rows.filter((r) => !bad.has(r.keys[0]));
}

/**
 * Page rows with the suspect queries' impressions and clicks taken out (CTR recomputed), so page-level CTR
 * reflects people. Query+page rows are needed to know which page each suspect query hit.
 */
export function subtractQueries(pageRows, queryPageRows, suspects) {
  const bad = new Set(suspects.map((s) => s.query));
  const take = new Map();
  for (const r of queryPageRows) {
    if (!bad.has(r.keys[0])) continue;
    const t = take.get(r.keys[1]) ?? { impressions: 0, clicks: 0 };
    t.impressions += r.impressions;
    t.clicks += r.clicks;
    take.set(r.keys[1], t);
  }
  return pageRows
    .map((r) => {
      const t = take.get(r.keys[0]);
      if (!t) return r;
      const impressions = Math.max(0, r.impressions - t.impressions);
      const clicks = Math.max(0, r.clicks - t.clicks);
      return { ...r, impressions, clicks, ctr: impressions ? clicks / impressions : 0 };
    })
    .filter((r) => r.impressions > 0);
}

/**
 * Child sitemaps of a submitted sitemap index that are not submitted on their own. Search Console groups an index
 * into one row; submitting each child (products, categories, articles…) makes the Page indexing report filterable
 * per section ("Submitted pages only"). `submitted` = rows from the sitemaps API, `children` = { indexUrl: [childUrl] }.
 */
export function unsubmittedChildren(submitted, children) {
  const norm = (u) => u.replace(/^http:/, "https:").replace(/\/+$/, "").toLowerCase();
  const have = new Set(submitted.map((s) => norm(s.path ?? s)));
  const out = [];
  for (const [index, kids] of Object.entries(children)) for (const k of kids) if (!have.has(norm(k))) out.push({ index, child: k });
  return out;
}
