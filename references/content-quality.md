# Content quality (E-E-A-T, AI text, YMYL)

## Honest authorship (non-negotiable)
- Never invent authors, experts, reviewers, credentials or "reviewed by" lines. Fake expert profiles are spam under
  Google's policies and can be illegal for protected titles (lawyer, doctor, accountant).
- Default byline: the organisation ("<Site> Editorial"), with a public methodology page: sources, testing, update
  cadence, corrections policy, ad independence.
- A real person profile only with real, verifiable facts the owner provides.
- `author-fake-risk` (info) lists Person authors so a human confirms each is real.

## AI-assisted text
- 100% AI-scaled content does not last. Every page needs a human pass: concrete numbers, local specifics, worked
  examples, what the page's own tool/data shows.
- Remove boilerplate (rule `ai-cliches`): "günümüzde", "sonuç olarak", "önemle belirtmek gerekir", "bu yazımızda",
  "in today's fast-paced world", "delve into", "it is important to note", "in conclusion".
- No filler intros. First paragraph answers the query (a 2-3 sentence summary box works well and gets quoted by AI
  answers).
- Vary sentence length; prefer active voice; cut adjectives that carry no fact.

## YMYL (money, health, law, official procedures)
- Every rate, limit, fee, date: primary source (official gazette, tax/social security authority, central bank,
  ministry). Record the source and its validity date next to the number.
- Show "valid from" dates on pages with yearly-changing numbers; update on the day the official change is published.
- Calculators: the article's formula must match the engine exactly; worked example with real numbers.
- Disclaimers are not a substitute for correctness.

## Structure that works (2026)
- One page per intent. A tool page and its "how is it calculated" article must target different intents and link to
  each other.
- H1 = the query in natural words; no colon-stacked titles. Title ≤ ~580 px, front-load the term.
- Headings as real questions users ask (People Also Ask, GSC queries, Bing queries).
- Tables for comparisons/rates; steps as ordered lists; short paragraphs.
- Dates: visible "last updated" when content materially changes (not on every deploy).

## Length
- No word-count targets for tools. Guides: as long as needed to fully answer; typical competitive guides 1200-2000
  words. Thin is "does not answer", not "few words".

## Images
- Original visuals (charts of the site's own data, annotated screenshots) beat stock. Descriptive file names and alt.
- `og:image` per page (1200×630) for shares; it can double as the article's primary image.
