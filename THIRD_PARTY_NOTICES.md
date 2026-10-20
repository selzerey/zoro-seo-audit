# Third-party notices

## Bundled HTML parser

`scripts/lib/vendor/node-html-parser.mjs` is a bundle of node-html-parser (MIT) and its dependencies css-select,
css-what, domhandler, domutils, dom-serializer, domelementtype, entities, nth-check (BSD-2-Clause), boolbase (ISC)
and he (MIT). Full license texts: [`scripts/lib/vendor/LICENSES.md`](scripts/lib/vendor/LICENSES.md).

## seomator-geo-audit

Parts of this project are adapted from seomator-geo-audit (SEOmator GEO Audit Skill), MIT License:

- `scripts/lib/data/schema-requirements.mjs` — required/recommended property table (from `src/geo_audit/data/schema_requirements.json`, changed; changes listed in the file header).
- `scripts/lib/rules/content.mjs` (`citability`), `scripts/lib/rules/technical.mjs` (`content-extractability`) and `scripts/lib/html.mjs` (empty app root) — limits taken from `src/geo_audit/data/thresholds.json` (400-word sections, 35-word sentences, 1200 / 50 character content limits). Code is our own.

```
MIT License

Copyright (c) 2026 SEOmator

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
