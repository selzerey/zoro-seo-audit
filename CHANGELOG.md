# Changelog

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
