# Zoro SEO Audit

[![npm](https://img.shields.io/npm/v/zoro-seo-audit.svg)](https://www.npmjs.com/package/zoro-seo-audit)
[![CI](https://github.com/selzerey/zoro-seo-audit/actions/workflows/ci.yml/badge.svg)](https://github.com/selzerey/zoro-seo-audit/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)

**A low-noise SEO audit for any website.** It crawls a live site and reports the problems that actually cost
traffic, with very few false alarms. It then turns your own Google Search Console and Bing Webmaster data into
to-do lists: pages that compete for the same query, queries close to page one, and pages worth pruning.

Use it three ways:

- **In Claude Code or Codex** — ask *"audit the SEO of example.com"* and the agent runs it, checks the findings on the
  live pages and fixes them in your code.
- **From a terminal** — `npx zoro-seo-audit https://example.com/`
- **In CI** — fail a deploy when a new `error` appears (`--format json`).

No account, no API key and no `npm install` are needed for the site audit. Search Console, Bing and IndexNow are
optional and use your own keys, stored only on your computer.

```text
$ npx zoro-seo-audit https://example.com/ --max 100

# SEO audit: https://example.com/
2026-10-20 · 100 pages crawled · 412 sitemap URLs · Error 2 · Warning 5 · Info 4

## Error
### Canonical target is not a 200 page `canonical-target-bad` (14)
- https://example.com/blog/post-1/ — → https://example.com/blog/post-1 (301)

## Warning
### Missing hreflang return link: page A lists B as an alternate but B does not list A. … `hreflang-no-return` (6)
- https://example.com/en/pricing/ — de → https://example.com/de/preise/ does not link back
…
```

## Contents

- [Why this one](#why-this-one)
- [Install](#install)
  - [Claude Code](#claude-code)
  - [Codex](#codex)
  - [Other agents](#other-agents-cursor-gemini-cli-copilot-)
  - [Command line only](#command-line-only)
- [Usage](#usage)
- [Search Console, Bing and IndexNow (optional)](#search-console-bing-and-indexnow-optional)
- [What it checks](#what-it-checks)
- [Languages](#languages)
- [Use in CI](#use-in-ci)
- [Privacy and safety](#privacy-and-safety)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Why this one

Big audit tools run 300+ checks and bury the few issues that matter under Lighthouse advice and English-only
heuristics. This one keeps about **100 narrow rules that each found a real problem on a real site**, and documents
the alarms that *look* real but are not ([`references/false-positives.md`](references/false-positives.md)).

Things most audits miss:

- **Indexing traps** — a `<div>` or `<img>` in `<head>` that silently drops the canonical; canonical in the HTTP
  header disagreeing with the HTML; canonical to a noindex page; canonical chains; soft 404 found by requesting a
  random URL; `noindex` pages still linked from the menu.
- **robots.txt** that is unreachable, malformed, blocks your CSS/JS (`Disallow: /_next/`), or contradicts its own
  `Content-Signal`; AI crawler access (GPTBot, ClaudeBot, PerplexityBot, Google-Extended …).
- **hreflang** — invalid codes (`en-UK`, `jp`), missing return links, missing self reference, targets that redirect
  or are noindex.
- **Leaks** — unrendered shortcodes and JavaScript values (`{year}`, `{{name}}`, `NaN`, `undefined`,
  `[object Object]`), raw Markdown, mojibake (`Ã¼`), localhost / preview links, tracking parameters on internal links,
  old prices or rates you list.
- **Dates** — `lastmod` and `dateModified` stamped at build time on every page, future dates, sitemap vs page drift.
- **Structured data** — invalid JSON-LD, missing required properties per type, dangling `@id`s, organisation
  identity spread over several ids.
- **AI search readiness** — content that only appears after JavaScript, very long passages that are hard to quote,
  `llms.txt` format. Reported as hints, never as ranking factors.
- **A polite crawler** — 4 parallel requests by default, honours robots.txt, backs off on `429 Too Many Requests`
  and never reports a rate-limited URL as broken.

Search data drives priorities, not scraped rankings: the Search Console and Bing reports work on the data Google and
Bing give you for your own site.

## Install

You need **Node.js 20 or newer** (`node --version`). Pick the agent you use; you can install for several.

### Claude Code

Inside Claude Code:

```text
/plugin install zoro-seo-audit --marketplace selzerey/zoro-seo-audit
```

On Claude Code older than 2.1.275, use the two-step form:

```text
/plugin marketplace add selzerey/zoro-seo-audit
/plugin install zoro-seo-audit@zoro
```

Or as a plain skill, from a terminal:

```bash
npx zoro-seo-audit install --claude
```

Then ask: *"Audit the SEO of https://example.com/"*. Updates: `/plugin update zoro-seo-audit` (plugin) or run the
`install` command again (skill).

### Codex

From a terminal:

```bash
npx zoro-seo-audit install --codex
```

This copies the skill to `~/.agents/skills/zoro-seo-audit`, where Codex looks for skills. Restart Codex, then ask
*"Audit the SEO of https://example.com/"* or call it explicitly with `$zoro-seo-audit`.

Inside Codex you can also ask the built-in installer:
*"$skill-installer install https://github.com/selzerey/zoro-seo-audit"*.

### Both at once

```bash
npx zoro-seo-audit install            # every agent found on this computer
npx zoro-seo-audit install --project  # only this project: ./.claude/skills and ./.agents/skills (commit them to share)
```

### Other agents (Cursor, Gemini CLI, Copilot …)

The skill follows the open [Agent Skills](https://agentskills.io) format (`SKILL.md` + `scripts/` +
`references/`), so any agent that reads skills can use it:

```bash
npx skills add selzerey/zoro-seo-audit
```

or clone it into that agent's skills folder:

```bash
git clone https://github.com/selzerey/zoro-seo-audit.git ~/.agents/skills/zoro-seo-audit
```

No `npm install` step: the scripts use only Node.js built-ins and a bundled HTML parser.

### Command line only

```bash
npx zoro-seo-audit https://example.com/                # run without installing
npm install -g zoro-seo-audit && zoro-seo-audit help   # or install the command
```

## Usage

### With an agent

Talk to it normally. Examples:

- *"Audit https://example.com/ and fix what you can in this repo."*
- *"Why is https://example.com/pricing/ not indexed?"* (uses Search Console URL inspection if set up)
- *"Which of my pages compete for the same queries?"*
- *"We just deployed. Check the 200 most important pages for regressions."*
- *"Submit the new blog posts to IndexNow."*

The skill tells the agent to **verify each finding on the live page before changing code**, to fix the template
once instead of every page, and to report in your language.

### From a terminal

```bash
zoro-seo-audit https://example.com/ --max 200 --out audit.md     # Markdown report
zoro-seo-audit https://example.com/ --format json --out audit.json
zoro-seo-audit https://example.com/ --only hreflang,canonical-target-bad
zoro-seo-audit https://example.com/ --skip og-image-missing,twitter-card-missing
zoro-seo-audit http://localhost:3000/ --max 50                    # audit a local build
```

| Option | Default | |
|---|---|---|
| `--max <n>` | `50` | Pages to crawl (sitemap URLs first, then links) |
| `--format md\|json` | `md` | Report format |
| `--out <file>` | stdout | Write the report to a file |
| `--lang en\|tr` | `en` | Report language (agents translate to yours) |
| `--only <ids/categories>` | all | e.g. `technical,schema` or `hreflang-no-return` |
| `--skip <ids>` | — | Rules to skip |
| `--concurrency <n>` / `--delay <ms>` | `4` / `100` | Crawl speed. Small or shared hosting: `--concurrency 2 --delay 300` |
| `--check-links <n>` | `300` | Uncrawled link targets to status-check |
| `--ua "<agent>"` | ZoroSEOAudit | User agent (or `ZORO_UA`) |
| `--stale-file <file>` | — | Old values that must not appear any more (see below) |
| `--placeholders <a,b>` | — | Exact shortcode names, e.g. `year,site_name` |
| `--dev-hosts <a,b>` | — | Preview hosts that must not be linked, e.g. `vercel.app` |
| `--quiet` | — | No progress output |

Severities: **error** fix now · **warn** should fix · **info** judge case by case.

**Stale values** — after a price, rate or legal limit changes, list the old values and the audit finds pages that
still show them (lines about the past, such as "in 2024 the rate was 18%", are ignored):

```text
# old-values.txt — one entry per line: label: old | old
VAT rate: 18% | %18
Minimum wage: 17,002
```

## Search Console, Bing and IndexNow (optional)

Run the setup wizard in a terminal (not in a chat — never paste keys into an AI chat):

```bash
npx zoro-seo-audit setup
```

It asks for each service, opens the Google consent page if you want, and saves everything to
`~/.config/zoro-seo-audit/.env` (readable only by you). Step-by-step instructions for creating the keys:
[`references/api-setup.md`](references/api-setup.md).

```bash
zoro-seo-audit gsc report --site sc-domain:example.com --brand example --out gsc.md
zoro-seo-audit gsc inspect --site sc-domain:example.com https://example.com/page/
zoro-seo-audit gsc zero --site sc-domain:example.com --sitemap https://example.com/sitemap.xml
zoro-seo-audit bing queries --site https://example.com/
zoro-seo-audit indexnow submit --host example.com https://example.com/new-page/
zoro-seo-audit doctor        # what is installed, which settings are found (values are never printed)
```

| Report | What you get |
|---|---|
| `gsc report` | Cannibalisation (several pages share a query), striking distance (positions 4-20), low CTR on page 1 |
| `gsc inspect` | Index verdict, coverage state and the canonical Google chose |
| `gsc zero` | Sitemap pages with zero impressions in 90 days — pruning or merge candidates |
| `bing queries` / `pages` | Bing and Copilot demand, summed over ~6 months |
| `indexnow submit` | Notifies Bing, Yandex, Seznam and Naver about new or changed URLs |

Settings are read from (first wins): environment variables, `$ZORO_SEO_AUDIT_ENV`, `./.zoro-seo-audit.env`,
`~/.config/zoro-seo-audit/.env`, then a `.env` next to `SKILL.md`. See [`.env.example`](.env.example) for every key.

## What it checks

| Category | Rules |
|---|---|
| site | site-closed, favicon-missing, host-normalisation, robots-missing, robots-unreachable, robots-syntax, robots-blocks-assets, robots-no-sitemap, content-signal-conflict, soft-404, search-bot-blocked, ai-bot-access, bot-wall, rate-limited, llms-txt, https-hsts, feed-missing |
| technical | status-error, redirect-chain, canonical-missing / -multiple / -relative / -target-bad / -elsewhere, canonical-header-conflict, canonical-outside-head, canonical-noindex-conflict, canonical-chain, head-invalid-element, head-duplicate-meta, charset-missing, viewport-missing, snippet-restricted, robots-directive-conflict, sitemap-not-indexable, sitemap-robots-blocked, sitemap-missing, sitemap-lastmod-future, sitemap-lastmod-uniform, sitemap-query-url, noindex-linked, lang-missing, mixed-content, slow-response, content-extractability |
| hreflang | hreflang-invalid, hreflang-conflict, hreflang-self-missing, hreflang-no-return, hreflang-target-bad |
| links | internal-link-broken, internal-link-redirect, internal-nofollow, link-empty-text, link-not-crawlable, link-dev-host, internal-link-tracking-params, inbound-chrome-only, click-depth, sitemap-orphan |
| onpage | title-missing / -duplicate / -near-duplicate / -no-brand / -long, description-missing / -duplicate / -long, h1-missing / -multiple, img-alt-missing, img-no-dimensions, lcp-image-lazy, og-image-missing, twitter-card-missing |
| schema | jsonld-invalid, article-fields, author-fake-risk, date-future, date-order, sitemap-lastmod-drift, datemodified-uniform, org-id-inconsistent, breadcrumb-positions, page-entity-missing, schema-dangling-id, faq-howto-note, schema-required-props, schema-recommended-props |
| content | placeholder-leak, markdown-leak, mojibake, stale-fact, thin-content, near-duplicate, ai-cliches, freshness-missing, citability |

What it deliberately does **not** do: Core Web Vitals lab scores (use PageSpeed Insights / CrUX), backlink data,
keyword volumes, or rank tracking from scraped results.

## Languages

The tool, its reports and the documentation are in English; reports are also available in Turkish (`--lang tr`).
When you use it through an agent, the agent reports in your language.

Rules that read words understand the page's `<html lang>`:

| | Languages |
|---|---|
| Full packs (AI clichés, abbreviations for sentence splitting, "page not found" wording, legal/contact page slugs, past-tense context, bot-check pages) | English, Turkish, German, French, Spanish, Italian, Portuguese, Dutch, Polish, Russian |
| Unicode sentence and word segmentation | every other language, including Japanese, Chinese, Korean, Thai, Arabic and Hindi |
| hreflang validation | all ISO 639-1 languages and ISO 3166-1 regions |

Adding a language is one entry in [`scripts/lib/lang.mjs`](scripts/lib/lang.mjs); see [CONTRIBUTING.md](CONTRIBUTING.md).

## Use in CI

```yaml
# .github/workflows/seo.yml — fail when the preview has new SEO errors
- run: npx -y zoro-seo-audit "$PREVIEW_URL" --max 100 --format json --out seo.json --quiet
- run: node -e "const r=require('./seo.json'); if (r.summary.error) { console.log(r.issues.filter(i=>i.severity==='error').map(i=>i.id).join('\n')); process.exit(1) }"
```

## Privacy and safety

- Runs on your computer. The only network requests go to the site you audit and, if you set them up, to the Google,
  Bing and IndexNow APIs with your own keys. No telemetry.
- Keys are stored in `~/.config/zoro-seo-audit/.env` with owner-only permissions, are never printed (`doctor` shows
  names only) and are blocked from commits by the included leak check.
- Crawl only sites you own or have permission to audit. The crawler follows the site's robots.txt rules for Googlebot,
  limits parallel requests and slows down when the server asks.

## Troubleshooting

| Problem | Fix |
|---|---|
| `node: command not found` or Node < 20 | Install the current LTS from [nodejs.org](https://nodejs.org) |
| The agent does not use the skill | Restart the agent; run `npx zoro-seo-audit doctor` to see where it is installed; ask with the name: *"use zoro-seo-audit to …"* |
| Many `rate-limited` or `bot-wall` findings | Your firewall/CDN blocks the crawler: allow your IP or set `--ua`, and crawl slower (`--concurrency 1 --delay 1000`) |
| Staging site shows only `site-closed` | Expected when robots.txt blocks everything; open indexing on staging to see what search engines will see |
| `Google credentials missing` | Run `npx zoro-seo-audit setup`; publish the OAuth consent screen, or the refresh token expires after 7 days |
| `BING_API_KEY missing` | Bing Webmaster → Settings → API access, then `npx zoro-seo-audit setup` |

## Contributing

Bug reports, false-alarm reports and new language packs are very welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
`npm test` runs every rule against planted problems and traps, without network access.

## License

[MIT](LICENSE). Bundled and adapted third-party code: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
