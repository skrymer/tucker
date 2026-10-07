# An Entry may be logged for tomorrow, and no further

A User preps tomorrow's food the evening before and wants to log it while it is
in front of them. Until now every Entry was stamped with the user's local today
— not by a rule, but because the client never offered another day; the backend
accepted any date at all. This ADR records what was decided, in a design
interview off the back of a throwaway three-variant UI prototype on `/log`. The
domain wording lives under **Entry** in [`CONTEXT.md`](../../CONTEXT.md).

## A future Entry is an ordinary Entry, not a plan

The tempting model is a **Planned Entry**: held apart from intake until the user
confirms, on the day, that they ate it. It is the more honest one — an Entry is
"one occurrence of the user eating a Food", and a meal prepped tonight has not
been eaten.

It was rejected because the plan and the fact almost never differ for the person
this is for: they prep exactly what they will eat. A Planned Entry would charge
a confirmation on every prepped meal, every day, to cover a rare mismatch that
deleting the Entry on the day already covers. So an Entry dated tomorrow is an
ordinary Entry, and needs no new aggregate, state, or step.

That is safe for the adaptive engine without any special case: a Weekly Review's
intake window ends the day **before** the review runs, and every trailing window
(Frequent Foods, Intake Breakdown, Micronutrient Intake) ends on today. Nothing
counts tomorrow's Entry before tomorrow is over. For the same reason tomorrow's
Entries may be deleted tonight — the deletion rule exists so deletion never
rewrites intake a review has counted, and no review can have counted a day that
has not begun.

## Tomorrow, and nothing further

The furthest ahead an Entry can be dated is the user's local **tomorrow**. Any
date and "up to a week" were both considered, for batch-prepping. Tomorrow was
chosen because it covers the evening prep exactly, and because a date further out
is far likelier a slip than a plan: an Entry parked weeks ahead is invisible until
it silently skews that day. Widening later is cheap; narrowing after people rely
on it is not.

It is an invariant, so it lives in the domain: the Entry factories take the
user's `today` and refuse a date after `today + 1`. `today` is the client's
(ADR 0014), carried as `clientToday` and checked for plausibility by `UserToday`,
exactly as a Weight Measurement refuses a future date. The guard bounds the
future only — backdating is a separate question with its own interaction with
Weekly Reviews, and is not decided here.

## The day is chosen at the point of commit, and never remembered

The prototype tried three placements: a Today / Tomorrow switch under the `/log`
heading, a heading that names the day with a sticky "Logging for tomorrow" banner,
and the choice inside the logging sheet beside the Log button. Both page-level
variants were rejected for the same failure: a User who switched to Tomorrow last
night, or ten minutes ago, logs today's lunch onto tomorrow without noticing,
because the control is not where their attention is when they commit.

So the choice sits in the sheet, beside the button, and the button names it ("Log
for tomorrow"). Every sheet opens on **Today** — the choice is not carried to the
next sheet, even within one visit, since carrying it reintroduces the forgetting
one sheet later. Evening prep pays one extra tap per meal for that.

The day is resolved when Log is tapped, not when the sheet opened — ADR 0014's
rule for today, applied to both choices — and the chip labels follow the clock,
so a sheet left open across midnight always shows the day it will log on.

## Consequences

- **Today shows tomorrow.** Without it a prepped meal cannot be seen or undone
  until morning. A **Tomorrow** list sits under today's, present only when
  tomorrow has an Entry, built from the same component as today's and headed the
  same way (the day, how many Entries, their calories). It shows no ring and no
  budget comparison: tomorrow's Budget is a forecast, and its day has not begun.
- **The tomorrow list must not read the daily summary.** `/api/summary` performs
  the lazy catch-up, so asking it about tomorrow can stamp a Weekly Review on a
  day that has not begun. Its totals come from the backend on the Entry read, not
  summed by the client (ADR 0002).
- **A Budget Projection for tomorrow is a forecast.** It weighs tomorrow's Entries
  against the review standing on tomorrow, which tonight is today's; a review
  falling due tomorrow may move the Budget before the day starts. Its warning
  names the day ("over tomorrow's budget"), since the bare wording reads as today.
