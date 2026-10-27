# AI search visibility (ChatGPT, Copilot, Perplexity, Gemini, Claude, AI Overviews)

## Access
- Allow citation/search bots and user-triggered fetchers: `OAI-SearchBot`, `ChatGPT-User`, `Claude-SearchBot`,
  `Claude-User`, `PerplexityBot`, `Bingbot` (feeds ChatGPT search + Copilot), `Googlebot` (AI Overviews/AI Mode use it).
- Training bots (`GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended`, `Applebot-Extended`) are a business choice;
  blocking them does not remove you from AI search answers. `Google-Extended` also controls grounding in Gemini apps.
- **Cloudflare (Oct 2026)**: "Disallow AI Training" writes the no-training preference into robots.txt and keeps
  search access for mixed-use crawlers (Googlebot, Bingbot, Applebot). **"Block" for Training now can block those
  same crawlers completely, including search.** If `search-bot-blocked` fires on a Cloudflare site, check this
  setting first. Bing does not read the robots no-training preference yet (planned early 2027).
- Rule `ai-bot-access` prints the current allow/block table. WAF bot-fight modes often block AI fetchers silently:
  check firewall logs, not just robots.txt.
- Content must be in server HTML. AI fetchers mostly do not run JavaScript.
- ChatGPT stopped appending UTM parameters to outbound links (Oct 2026): count referrals by referrer host, not by
  `utm_source`.

## Being cited
- Answer-first paragraphs: the first 2-3 sentences under each H2 answer the heading's question on their own.
- Concrete, attributable facts: numbers with units, dates, sources. AI answers prefer quotable sentences.
- Tables for rates/comparisons; consistent terminology; one page per intent.
- Fresh dates on pages that change (visible + `dateModified`).
- Entity clarity: consistent org name, `@id`, `sameAs` to real profiles.

## Measuring
- Search Console → **Generative AI performance** report (UI only, rolled out Aug-Oct 2026): how often your URLs
  appear in AI Overviews and AI Mode, by page, country, device and over time. Impressions only: no clicks, CTR,
  position or queries. Read it as "which pages and markets Google's AI systems use", then ask which parts of the
  buying journey (pricing, comparison, use case, case study) are missing. The API cannot isolate it; the
  impressions are inside normal `web` totals.
- Bing Webmaster → **AI Performance** (UI only): citations in Copilot/Bing AI answers and the "grounding" queries
  behind them, plus (preview, Oct 2026) **Intents** (informational / commercial / research / local), **Topics**
  (query clusters), **Citation Share** (your share of the citations for a grounding query) and **Compare** (two
  periods). Use the grounding queries as content ideas; use citation share, not raw citations, to judge a topic.
  Data appears weeks after launch.
- GA4: referrals from chatgpt.com, perplexity.ai, copilot.microsoft.com, gemini.google.com.

## Optional, low priority
- `llms.txt`: no major engine uses it for ranking or citations (2026). Fine to add for developer docs sites.
- Markdown twins, `.well-known` agent cards, MCP manifests: only for products that want agent integrations.
