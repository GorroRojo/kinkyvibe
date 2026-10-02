---
name: nightly-report
description: How to write the morning report («Día N» / «Noche N» bitácora) that summarizes an overnight work session for gorrite. Use when preparing the morning summary after a night of autonomous work, or when gorrite asks for a report of what happened.
---

# Morning report for gorrite

The report is the first thing gorrite reads in the morning. It replaces scrolling through the
night's chat. gorrite compared reports: night 3 was good, Día 4 (2/10) was «really bad». The
difference is below. Follow this every time.

## What went wrong in Día 4 (don't repeat)

- It was a ledger of PRs, not a story: lists of merges, limits and waiting items, without saying
  what changed for gorrite or why things happened.
- It was patched six times during the morning; order and emphasis drifted and the lead went
  stale.
- Decisions were scattered across four places instead of one.
- No graphs and no screenshots.
- Timestamps were an hour off.

## Rules

1. **Write it once, at the end.** Collect data during the night (timeline, notes), but compose
   the page in one pass before gorrite's morning (~10:00 UTC = 07:00 in Argentina). If something
   important happens after publishing, add one short «Después de publicar» note at the top
   instead of reshuffling the page.
2. **Open with the 3 things that changed for gorrite**, in plain words: what they can now do or
   see, not PR numbers. Example: «Panel → Eventos ya no se cuelga con todo en la base».
3. **One «Decidí» section**, right after the opening: every decision gorrite owes, each as a
   yes/no (or short-choice) question with the link to act on it and what happens on each answer.
   Nothing that needs gorrite lives anywhere else on the page.
4. **Tell the night as a short story** (like night 3): what the plan was, what happened, what went
   wrong and why, what you did about it (e.g. «el CI falló dos veces; en vez de reintentar,
   busqué la causa: …»). Honest, including mistakes.
5. **Nice graphs.** Load the `dataviz` skill first. Usual set:
   - merge timeline through the night (from the timeline log), with lanes per agent or block;
   - before/after charts for any performance work (same units, one scale);
   - PR queue by state (merged / waiting for gorrite / in progress / blocked);
   - test or CI time if it changed.
     Inline SVG, theme tokens, readable in light and dark.
6. **Screenshots** of what's new in the demo: light mode only, fake data only, never gorrite's
   real email or any real person's data. Put each next to the «how to try it» steps.
7. **Short reference at the bottom**: merged list (one line each), known limitations, risks,
   Release estimate with its uncertainty.
8. **Correct times.** Check `date -u`; show gorrite's local time (UTC−3) with the UTC in small
   text if useful.
9. **Language**: rioplatense Spanish with voseo and inclusive «-e», plain words, no internal
   jargon (say what a PR does, then its number).

## Data to keep during the night

- Timeline log: one JSON object per line in the session scratchpad, e.g.
  `night<N>/timeline.jsonl`, with this shape (use it consistently, older logs mixed two shapes):
  `{"t":"<UTC ISO>","lane":"<agent or block>","ev":"start|pr|merge|ci_fail|fix|demo|note","pr":<n>,"what":"<short Spanish text>"}`
- Notes file with decisions and anything gorrite said (the NOTES file of the session).
- Measurements (timings, test durations) as you take them, with units and conditions.

## Page format

- Docs-map style: same base CSS as the documents map, `<title>` short (e.g. «Noche 5»).
- Publish as an Artifact; link it from the documents map (republish the map at its existing URL,
  never a new one) and from the plan page.
- After publishing, re-read the page once as gorrite would: is the first screen enough to know
  what changed and what to decide?

## Privacy (public repo, shared pages)

No buyer or community member data, no secrets, no bank aliases/CBU, no exploit details for
unfixed vulnerabilities (describe vaguely). Screenshots and examples use obviously fake data.
