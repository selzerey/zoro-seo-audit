# Changelog

## 1.1.0 — 2026-10-28

Gaps found by reading what SEOs reported on X in October 2026, each checked against the rules before landing.

### Search Console
- `gsc report`: **suspect queries** (very many impressions, ~0 clicks, page 1: rank trackers / scrapers, not people)
  are listed first and excluded from cannibalisation, striking distance and low-CTR lists, so a title is no longer
  "rewritten" for traffic that was never human. `--keep-suspects` disables the filter.
- `gsc sitemaps` is now a report: submitted sitemaps with errors/warnings and contents, plus **index children not
  submitted on their own** (submit each child so Page indexing can be filtered per section).
- Documented: Google's typical crawl/index timelines (recrawl ~30 days: check *last crawl* before judging a change),
  the Generative AI performance report (UI only, impressions only), performance-report delays, and that GSC
  attributes data to the canonical Google chose.

### Core Web Vitals
- New `scripts/cwv.mjs` / `zoro-seo-audit cwv <url> [--origin] [--form phone|desktop]`: CrUX field data (LCP, INP,
  CLS, FCP, TTFB p75, rating, good/needs-improvement/poor shares). Needs `CRUX_API_KEY` (free); `setup` and
  `doctor` know the key.

### Rules
- New `favicon-blocked` (warn): the icon, or a same-origin redirect hop on the way to it, is disallowed for
  Googlebot-Image/Googlebot in robots.txt (Google's favicon guidance: the redirect from the home page to the icon
  must be followable).
- New `hidden-keyword-repetition` (info): the title's main term repeated far more in JSON-LD / meta / Open Graph /
  alt text than in the visible copy (≥ 15 machine-side hits and ≥ 3× the visible count): over-optimisation that
  also hurts passage extraction.

### References
- `ai-search.md`: Cloudflare "Disallow AI Training" vs "Block" (Block can now cut Googlebot/Bingbot/Applebot off
  entirely), Bing AI Performance insights (Intents, Topics, Citation Share, Compare), ChatGPT links without UTM.
- `content-quality.md`: user-published / generated / interactive-tool pages named in Google's spam policies.
- `false-positives.md`: the two new rules and the Search Console data pitfalls.

## 1.0.0 — 2026-10-20

First public release.

### Install
- Claude Code plugin: `/plugin install zoro-seo-audit --marketplace selzerey/zoro-seo-audit`
- `npx zoro-seo-audit install` copies the skill for Claude Code (`~/.claude/skills`) and Codex (`~/.agents/skills`);
  `--project` installs into the current repository. Links and git clones are never overwritten.
- Works from a plain clone: no `npm install` (the HTML parser is bundled in `scripts/lib/vendor/`).
- Codex metadata (`agents/openai.yaml`); `SKILL.md` follows the Agent Skills specification.

### Command line
- `zoro-seo-audit <url>`, `gsc`, `bing`, `indexnow`, `google-auth`, `help` for every tool.
- `setup` wizard saves Search Console / Bing / IndexNow settings to `~/.config/zoro-seo-audit/.env`.
- `doctor` shows installs and which settings are found, never their values.

### Rules
- New `hreflang` category: hreflang-invalid, hreflang-conflict, hreflang-self-missing, hreflang-no-return,
  hreflang-target-bad.
- New `rate-limited`: `429 Too Many Requests` is retried (Retry-After honoured) and never reported as a broken link.
- Language packs for English, Turkish, German, French, Spanish, Italian, Portuguese, Dutch, Polish and Russian
  (AI clichés, sentence abbreviations, "not found" wording, legal-page slugs, past-tense context, bot checks);
  Unicode segmentation for every other language (CJK word counts, Japanese/Chinese sentences).

### Fixed
- Text was lower-cased with Turkish rules on every page, so English "In …" became "ın …" and some phrases were
  missed. Case folding now follows the page language.
- soft-404 missed titles such as "Error 404".

### Changed
- Reports are in English by default (`--lang tr` for Turkish).

## 0.1.0

Internal version: crawler, ~90 rules, Search Console / Bing / IndexNow scripts.
