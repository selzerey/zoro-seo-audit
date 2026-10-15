# AI search visibility (ChatGPT, Copilot, Perplexity, Gemini, Claude, AI Overviews)

## Access
- Allow citation/search bots and user-triggered fetchers: `OAI-SearchBot`, `ChatGPT-User`, `Claude-SearchBot`,
  `Claude-User`, `PerplexityBot`, `Bingbot` (feeds ChatGPT search + Copilot), `Googlebot` (AI Overviews/AI Mode use it).
- Training bots (`GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended`, `Applebot-Extended`) are a business choice;
  blocking them does not remove you from AI search answers.
- Rule `ai-bot-access` prints the current allow/block table. WAF bot-fight modes often block AI fetchers silently:
  check firewall logs, not just robots.txt.
- Content must be in server HTML. AI fetchers mostly do not run JavaScript.

## Being cited
- Answer-first paragraphs: the first 2-3 sentences under each H2 answer the heading's question on their own.
- Concrete, attributable facts: numbers with units, dates, sources. AI answers prefer quotable sentences.
- Tables for rates/comparisons; consistent terminology; one page per intent.
- Fresh dates on pages that change (visible + `dateModified`).
- Entity clarity: consistent org name, `@id`, `sameAs` to real profiles.

## Measuring
- Bing Webmaster → **AI Performance** (UI only): citations in Copilot/Bing AI answers and the "grounding" queries
  behind them. Use those queries as content ideas. Data appears weeks after launch.
- Search Console counts AI Overviews/AI Mode impressions inside normal Web results (no separate filter in API).
- GA4: referrals from chatgpt.com, perplexity.ai, copilot.microsoft.com, gemini.google.com.

## Optional, low priority
- `llms.txt`: no major engine uses it for ranking or citations (2026). Fine to add for developer docs sites.
- Markdown twins, `.well-known` agent cards, MCP manifests: only for products that want agent integrations.
