# Contributing

Thanks for helping! The most valuable contributions are **false-alarm reports**, **missed problems** and
**language packs**.

## Setup

```bash
git clone https://github.com/selzerey/zoro-seo-audit.git
cd zoro-seo-audit
npm test                          # Node 22+; no network access needed
git config core.hooksPath .githooks   # once: blocks commits that contain secrets
```

`npm install` is only needed to rebuild the bundled HTML parser (`npm run vendor`).

## Add or change a rule

1. Add one object to the matching file in `scripts/lib/rules/`:
   ```js
   { id: "kebab-id", severity: "error" | "warn" | "info", en: "What is wrong and what to do", tr: "…", check(ctx) { return [{ url, detail }] } }
   ```
2. Add a test in `scripts/tests/` with a **planted problem it must find** and, where relevant, **a trap it must
   ignore** (the realistic page that looks similar but is fine).
3. If the rule has a known false alarm, document it in `references/false-positives.md`.
4. Add the id to the tables in `SKILL.md` and `README.md`.

A rule earns its place by finding a real problem on a real site. Prefer one narrow, verifiable check over a broad
heuristic.

## Add a language

Copy the `en` entry in `scripts/lib/lang.mjs`, translate each list for your language and add a case to
`scripts/tests/rules-intl.test.mjs`. All lists must be lower-case. Good sources: your own site's 404 page,
legal-page URLs of large sites in your country, and AI-generated text you had to clean up.

Report translations (`tr`/`en` strings in rules) are welcome too, but not required: agents translate reports.

## Pull requests

- `npm test` and `node scripts/leak-check.mjs` must pass.
- Never include real API keys, tokens, private domains or customer URLs, also not in tests (use `site.test`).
- Keep commits focused; describe the real-world case that motivated the change.
