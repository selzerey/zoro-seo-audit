# Structured data worth having (2026)

Use JSON-LD. Markup must describe what is visible on the page. Validate with Google Rich Results Test and the
`schema` rules of `scripts/audit.mjs`.

## Site-wide entity
- One `Organization` (or `Person` for personal sites) with a stable `@id`: `https://<domain>/#organization`.
  Full node (name, url, logo, sameAs, contactPoint) on home/about/contact; everywhere else reference it as
  `{"@type":"Organization","@id":"https://<domain>/#organization","name":"…","url":"https://<domain>/"}`.
- Every `publisher`, `creator`, `author` (when the org signs), `worksFor` uses that same `@id`. Rule
  `org-id-inconsistent` catches nodes without it (common in image `creator` and list-page `publisher`).
- `WebSite` with `@id` `https://<domain>/#website`, `publisher` → org id. SearchAction sitelinks box is retired; optional.

## Page types
| Page | Types | Must have |
|---|---|---|
| Article / guide / blog post | `Article` or `BlogPosting` | headline, datePublished, dateModified, author, publisher, image (≥1200 px wide), mainEntityOfPage |
| Calculator / web tool | `WebApplication` (or `SoftwareApplication`) | name, url, applicationCategory, operatingSystem "Any", offers price 0 if free |
| Tool + its guide on one page | `WebApplication` + `Article` | Article `about`/`mainEntityOfPage` the page |
| Rates/tables from official sources | `Dataset` | name, description, creator, temporalCoverage, dateModified = data date, isBasedOn/citation source |
| Any page below home | `BreadcrumbList` | positions 1..n in order, `item` URL on all but the last |
| Listing page (blog, category) | `CollectionPage` / `Blog` + `ItemList` | items as short nodes (headline + url); no full Article fields needed |
| Event, Product, Recipe, JobPosting, LocalBusiness | their own types | follow Google's feature docs exactly |

## Ratings
- `aggregateRating` only when the rating is visible on the page, from real users, with a minimum count you choose
  (e.g. ≥5 votes). Never on Organization about itself.

## Dates
- `datePublished` ≤ `dateModified`. Both ISO 8601 with timezone.
- `dateModified` changes only with meaningful content changes; keep sitemap `lastmod` the same day.

## Images
- `ImageObject` with width/height, caption; `creator`/`creditText`/`copyrightNotice`/`license`/`acquireLicensePage`
  enable the "Licensable" badge in Google Images.
- Give the page's main visible image an `@id` and reference it from `primaryImageOfPage` instead of repeating it.

## Low or no value now
- FAQPage, HowTo (see false-positives.md). `speakable`: harmless, little use. SiteNavigationElement: ignored.

## Validation checklist
1. `node scripts/audit.mjs <url> --only schema --max 30`
2. Rich Results Test on one URL per template.
3. GSC → Enhancements reports after deploy (errors appear in days).
