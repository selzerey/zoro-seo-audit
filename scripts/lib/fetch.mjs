// HTTP with the redirect chain recorded (redirects are followed by hand so every hop is visible).
export const DEFAULT_UA = "Mozilla/5.0 (compatible; ZoroSEOAudit/1.0; +https://github.com/selzerey/zoro-seo-audit)";

/** Seconds to wait from a Retry-After header (number or HTTP date), capped; null when absent. */
export function retryAfter(value, cap = 30) {
  if (!value) return null;
  const n = Number(value);
  const s = Number.isFinite(n) ? n : (Date.parse(value) - Date.now()) / 1000;
  return Number.isFinite(s) ? Math.min(cap, Math.max(1, Math.ceil(s))) : null;
}

/**
 * Like fetchChainOnce, but a "slow down" answer (429, or 503 with Retry-After) is retried after a pause, so a busy
 * server is not reported as broken. `retries` pauses: Retry-After (max 30 s) or 2 s, 6 s.
 */
export async function fetchChain(url, opts = {}) {
  const { retries = 2, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = opts;
  let r = await fetchChainOnce(url, opts);
  for (let i = 0; i < retries && (r.status === 429 || (r.status === 503 && r.headers?.["retry-after"])); i++) {
    await sleep((retryAfter(r.headers?.["retry-after"]) ?? [2, 6][i] ?? 6) * 1000);
    r = await fetchChainOnce(url, opts);
  }
  return r;
}

async function fetchChainOnce(url, { ua = DEFAULT_UA, timeout = 20000, maxHops = 10, method = "GET" } = {}) {
  const chain = [];
  let current = url;
  for (let hop = 0; hop <= maxHops; hop++) {
    const started = Date.now();
    let res;
    try {
      res = await fetch(current, {
        method,
        redirect: "manual",
        headers: { "user-agent": ua, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
        signal: AbortSignal.timeout(timeout),
      });
    } catch (e) {
      chain.push({ url: current, status: 0, error: e.name === "TimeoutError" ? "timeout" : String(e.message ?? e) });
      return { url, finalUrl: current, status: 0, chain, headers: {}, body: "", ms: Date.now() - started };
    }
    const loc = res.headers.get("location");
    chain.push({ url: current, status: res.status });
    if (res.status >= 300 && res.status < 400 && loc) {
      await res.body?.cancel();
      current = new URL(loc, current).href;
      continue;
    }
    const headers = Object.fromEntries(res.headers);
    const type = headers["content-type"] ?? "";
    const body = method === "HEAD" || !/text|xml|json/.test(type) ? (await res.body?.cancel(), "") : await res.text();
    return { url, finalUrl: current, status: res.status, chain, headers, body, ms: Date.now() - started };
  }
  return { url, finalUrl: current, status: 0, chain, headers: {}, body: "", error: "too many redirects" };
}

/** Runs async jobs with a concurrency cap and an optional pause between starts (polite crawling). */
export async function pool(items, limit, fn, { delay = 0 } = {}) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
      if (delay) await new Promise((r) => setTimeout(r, delay));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
