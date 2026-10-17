# Measuring AI answer visibility with a fixed question set

`ai-search.md` covers access and how to be quotable. This file is the measurement routine: what assistants say about
the site when asked the questions real users ask.

## Build the set once
- 20-25 questions a buyer or user would ask, in their language and wording, not your page titles. Mix:
  definitions ("X nedir"), how-to, comparisons, "best tool for …", brand questions ("is <brand> reliable"), and
  questions where your page holds a number (rate, limit, date).
- Source them from GSC/Bing queries (Bing's AI Performance grounding queries are ideal), support mail, forum threads.
- Freeze the set. Change it only quarterly, so runs stay comparable.

## Each run (monthly, same day range)
For every question and every assistant you track (ChatGPT search, Copilot, Perplexity, Gemini, Google AI Mode):
1. Ask in a clean session (logged out or a fresh profile), same language, same location if possible.
2. Record: date, assistant, whether the site is mentioned or cited, the cited URL, what was said about the site,
   which other sources were cited, and any wrong fact.
3. Save the answer text or a screenshot. Answers change between runs and between users; the record is the evidence.

## Reporting language
- Say what was observed: "on 2026-10-01 Perplexity cited our page in 7 of 25 questions". Do not say "we rank 7th
  in Perplexity"; there is no stable rank.
- Never invent a visibility percentage or a share-of-voice number that was not counted from the record.
- Small samples swing. Treat a change of one or two citations as noise.

## Acting on it
- Wrong fact about the site → state the correct fact plainly on the relevant page (and in structured data if it
  applies); check that the page is crawlable by the assistant's search bot (`ai-bot-access`).
- A third-party page cited instead of yours → read it: is it fresher, more direct, a primary source? Fix your page;
  list the cited sites as places where a mention would help.
- Not cited at all on questions you answer well → check server-rendered HTML (`content-extractability`), the first
  paragraph under the heading (does it answer on its own?), and snippet directives (`snippet-restricted`).
