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
