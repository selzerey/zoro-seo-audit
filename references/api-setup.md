# API setup (one-time per site/account)

Fastest: run `npx zoro-seo-audit setup` in a terminal; it asks for each value below and saves them to
`~/.config/zoro-seo-audit/.env`. Never paste keys into an AI chat. Manual alternative: copy `.env.example` there.
The leak check blocks key shapes from commits.

## Google Search Console
1. Cloud Console → new project → enable **Google Search Console API**.
2. OAuth consent screen: External, add your Google account as test user, then **Publish (In production)** — otherwise
   refresh tokens die after 7 days.
3. Credentials → OAuth client ID → **Desktop app** → download JSON.
4. `npx zoro-seo-audit setup` (answers the next step for you), or
   `node scripts/google-auth.mjs --client client.json --out google-token.json` → open the printed URL, allow.
5. `.env`: `GOOGLE_OAUTH_JSON=/abs/path/client.json`, `GOOGLE_TOKEN_JSON=/abs/path/google-token.json`
   (or the three `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` values), `GSC_SITE=sc-domain:example.com`.
6. Test: `node scripts/gsc.mjs sites`.
- Domain property = `sc-domain:example.com` (covers http/https/www). URL-prefix = `https://example.com/`.
- URL Inspection API quota: 2,000/day, 600/min per property.

## Bing Webmaster
1. Add + verify site (DNS CNAME or import from GSC).
2. Settings → API access → generate key → `.env`: `BING_API_KEY=…`, `BING_SITE=https://example.com/`.
3. Test: `node scripts/bing.mjs sites`.

## IndexNow
1. Generate a key (8-128 chars, a-z A-Z 0-9 -): e.g. `node -e "console.log(crypto.randomUUID().replace(/-/g,''))"`.
2. Serve it at `https://example.com/<key>.txt` with the key as the only content.
3. `.env`: `INDEXNOW_KEY=…`, `INDEXNOW_HOST=example.com`.
4. `node scripts/indexnow.mjs check` → then `submit <url>…` only for new/changed URLs.

## Core Web Vitals (CrUX)
1. Cloud Console (same project is fine) → enable **Chrome UX Report API** → Credentials → **API key** (restrict it to
   that API).
2. `.env`: `CRUX_API_KEY=…` (or answer the question in `npx zoro-seo-audit setup`).
3. Test: `node scripts/cwv.mjs https://example.com/ --origin`. Page-level data needs enough Chrome visitors; small
   sites get origin-level data only. Field data lags about 28 days.

## Crawl politeness
- Default: 4 parallel requests, 100 ms pause each. For small/shared hosting use `--concurrency 2 --delay 300`.
- Own WAF blocks the audit? Add an allow rule for your IP or UA (`ZORO_UA` env sets the UA).
