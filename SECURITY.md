# Security

## Reporting a vulnerability

Please report security issues privately through
[GitHub security advisories](https://github.com/selzerey/zoro-seo-audit/security/advisories/new), not in public
issues. You will get an answer within a few days.

## How the tool handles secrets

- API keys and tokens are read from environment variables or local `.env` files only (see `.env.example`). The
  setup wizard writes `~/.config/zoro-seo-audit/.env` with owner-only permissions on macOS and Linux.
- Values are never printed: `doctor` lists key names only, and errors do not echo keys.
- `scripts/leak-check.mjs` (enabled with `git config core.hooksPath .githooks`) blocks commits that contain
  secret-shaped strings, `.env` files or token files.
- The only network requests go to the audited site and, when configured, to the Google Search Console, Bing
  Webmaster and IndexNow APIs. There is no telemetry.
