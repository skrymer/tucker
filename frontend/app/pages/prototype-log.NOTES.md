# PROTOTYPE — where does logging live? (throwaway)

Route: `/prototype-log?variant=A|B|C` · cycle with the top bar or ← / →.
**Judge on a phone viewport.** Delete this file and `prototype-log.vue` once answered.

## The question

Logging from `/foods` beat Today's Log-entry sheet in real use. The picker there is
a `USelectMenu` — and it already suppresses the keyboard (`inputmode: 'none'`), so the
friction is not typing. It is **height** (a popover inside a sheet vs a full page),
**information** (a bare name vs name + kcal + protein + Recipe badge), and **taps**
(open → scroll → select → grams vs row → grams).

So: where should logging live, and what should the nav shell be?

## What is held constant

All three variants render the **proposed shell** — three primary tabs plus a `More`
sheet for the secondary destinations — so the only variable is where logging lives.
Check is demoted to `More` in every variant (its re-entry point is a separate design
question, not answered here).

## Variants

|       | Primary tabs             | Where you log                                | Foods page is               |
| ----- | ------------------------ | -------------------------------------------- | --------------------------- |
| **A** | Today · Foods · Review   | row tap on `/foods`, Frequent section on top | catalog **and** log surface |
| **B** | Today · **Log** · Review | its own primary destination                  | catalog only (in `More`)    |
| **C** | Today · Foods · Review   | Today's sheet, list instead of typeahead     | catalog only                |

## What to look for

- Does the top-10 make the "all foods" list below it irrelevant? If yes, B's two-column
  grid is doing the real work and the alphabetical list is padding.
- In C, does the sheet feel tall enough, or has the cramped scroller come back?
- In A, the warning box on Today is the honest cost: two logging surfaces, two sets of rules.
- Where does an **Estimated Entry** feel like it belongs? It is not a Food, so it has no
  home on `/foods` at all — A strands it on Today.

## Known defect this surfaced (real, not prototype)

`LogFoodSheet` (the `/foods` row tap) has **no Budget Projection gate**. `LogEntrySheet`
runs both forms through `useBudgetGate`; the surface actually in use never warns.
The prototype's grams sheet has the gate in all three variants, to show what is missing.

## Verdict

**B won.** A dedicated `Log` destination, with the top 10 as a two-column grid.

Why, from driving all three at 412px:

- B fits all ten in one screen with **no scrolling**. A and C both scroll for the same
  ten, because a full-width row spends 400px of width to render 30 characters. The grid
  is the reason B wins, not the tab.
- B is the only variant where **"Log an estimate instead" is a peer** of picking a Food.
  An estimate is not a Food, so `/foods` has nowhere to put it — A strands it on Today.
- C's sheet was fine (`ResponsiveOverlay` is already `max-h-[90dvh]`, so the cramped
  scroller never materialised) but it buries Today behind a dim for a screen opened
  ten times a day.

Settled alongside it: **Today loses its Log-entry button** (header button and FAB) — the
Log tab is the single way in. Nav becomes Today · Log · Review, with Foods, Check and
Profile behind `More`.

Still open, not answered by this prototype: how "top 10" is ranked, and where Check is
reached from now that it has left the tab bar.
