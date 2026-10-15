# Zoro SEO Audit

Low-noise SEO audit skill for Claude Code (also usable as plain Node CLI).

**TR:** Canlı siteyi tarar, gerçek sorunları az yanlış alarmla bulur; Search Console ve Bing verisiyle kanibalizasyon,
fırsat sorguları ve budama adaylarını çıkarır; IndexNow ile yeni adresleri bildirir. Kurallar Türkçe ve İngilizce rapor
verir.

**EN:** Crawls a live site and reports real problems with few false alarms; turns Search Console and Bing data into
cannibalisation, striking-distance and pruning lists; submits new URLs via IndexNow. Reports in Turkish or English.

## Install as a Claude Code skill
```bash
git clone <this repo> ~/.claude/skills/zoro-seo-audit
cd ~/.claude/skills/zoro-seo-audit && npm install
cp .env.example .env   # only if you use GSC / Bing / IndexNow
```
Claude picks it up automatically from `SKILL.md`. Or call the scripts directly:

```bash
node scripts/audit.mjs https://example.com/ --max 100 --out audit.md
node scripts/gsc.mjs report --site sc-domain:example.com --out gsc.md
node scripts/bing.mjs queries --site https://example.com/
node scripts/indexnow.mjs submit --host example.com https://example.com/new-page/
```

## Why another SEO audit
Big rule sets (300+ checks) bury the few issues that matter under English-only heuristics and Lighthouse advice.
This one keeps ~50 rules that found real problems on real sites, and documents the alarms that look real but are not
(`references/false-positives.md`). Search data (GSC/Bing) drives priorities, not scraped rankings.

## Contributing
- `npm test` must pass (unit tests + a local fake-site crawl).
- Enable the leak check once per clone: `git config core.hooksPath .githooks`. Put private words (project names,
  domains, people) in `.leak-words` (git-ignored); the hook blocks commits containing them or secret-shaped strings.

MIT licensed.
