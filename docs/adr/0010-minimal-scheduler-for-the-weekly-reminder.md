# A minimal scheduler sends the weekly-review reminder

Tucker's adaptive engine deliberately **has no scheduler**: a `Weekly Review`
fires by *lazy catch-up* on app use — when the latest review is a week or more
old, the next request runs one, snapped to today. `CONTEXT.md` states this
outright ("There is no scheduler"), and the backend carries no cron, no
`@Scheduled`, no background jobs.

F6 adds a **Weekly-Review Reminder**: a web push that nudges the user to open
Tucker when a review has come due and they've drifted away. That is, by
definition, a *server-initiated event that must fire while the user is not in the
app* — otherwise there is nothing to remind them of. A lazy, request-driven model
cannot do it. So F6 introduces the one scheduled job Tucker has ever had, and this
ADR records why that does **not** break the "no scheduler" decision.

## Decision

Add exactly **one** Spring `@Scheduled` job, scoped solely to *sending reminders*.
It **computes nothing** — it never runs a review, never touches Maintenance, the
Calorie Budget, or the Protein Floor. It only *reads* existing state and, when the
conditions hold, sends a push.

The invariant that mattered is preserved: **Maintenance, the Budget, and the Floor
are still (re)computed only by the Weekly Review engine — lazily on app use, or on
a Goal change.** The reminder job is a notifier bolted alongside that engine, not a
clock driving it. "No scheduler" was always a statement about *the adaptive
recompute*, not a vow of notification celibacy; we sharpen the glossary to say so.

**Firing rule.** Each tick (hourly), for the user, send a reminder when **all** hold:
- the latest Weekly Review is **≥ 7 days old** (the same predicate lazy catch-up
  uses — a review *would* fire on next open), and
- the user has at least one **Push Subscription**, and
- the user **hasn't opened the app today** (the absent-today gate — redundant in
  practice, and never the reason a reminder is suppressed; see *What counts as
  showing up* below), and
- it is the user's **local reminder hour** (their `Profile` timezone + chosen hour),
  so the push lands at a civilised time, not whenever the cron first notices.

**Dedupe.** Store a single `lastReminderSentAt`. Suppress if it is *after* the
latest review's date — i.e. we already nudged for the current overdue episode.
When the user finally opens the app, lazy catch-up writes a fresh review whose date
moves past `lastReminderSentAt`, and next week's episode becomes eligible again. The
existing review timeline *is* the cycle boundary; no separate counter.

## What counts as showing up (amended — issue #174)

The firing rule has two gates that both mean *the user came back*: the review is
**≥ 7 days old**, and they **haven't opened the app today**. Those are not
independent, and the second one is never reached.

**Opening Tucker runs the due review.** Lazy catch-up sits on the daily-summary
read, every app-open surface performs that read, and its setup gate is the same
predicate the reminder's is. So any request that could have mattered to the
reminder has already written a review dated today, and `ReviewCadence.isOverdue`
answers *no* before the absent-today gate is consulted. There is no reachable
state in which a reminder is due *and* the user was seen today.

So **"showed up today" means opened Tucker at all** — not "logged something", not
"looked at the dashboard". The Check tab ([ADR 0022](0022-a-check-states-cost-and-return-and-never-labels-a-food.md))
is what forced the question: it is a *shopping* action that creates no Food and no
Entry, so scanning jars in a supermarket silencing that day's reminder looks like a
bug. It isn't, and for a stronger reason than "they did open the app" — the review
the reminder would nudge about has genuinely **run**, and the nudge's own words
("refresh your calorie budget") are already satisfied by the time it would fire. A
Check depends on exactly that to state its figures against a current Budget instead
of a week-old one.

The alternative dies on arithmetic rather than taste. Opening a Check either runs
the overdue review (fresh Budget, no nudge) or does not (stale Budget, nudge fires);
it cannot do both, because "an up-to-date Budget after an overdue week" *is* "the
review ran".

**The absent-today gate is kept**, restated as what it is: a redundant guard, not a
load-bearing condition. It costs one column and one predicate, and it is the only
thing standing between a future screen that reads targets without advancing the
cadence and a push telling someone to open an app they are already holding.

## Alternatives rejected

- **Piggyback on existing traffic only** — send a push only during a request the
  user already triggered. Honours "no scheduler" literally but is pointless: web
  push exists to reach a user who *isn't* there. If they were making a request, the
  review would already have run.
- **Defer web push entirely** — ship F6 as install + offline shell only. Leaves the
  increment's headline feature unbuilt for no structural gain; the job is cheap.
- **An external scheduler** (system cron hitting an endpoint, a hosted scheduler) —
  extra moving parts and another failure surface for a single hourly tick on a box
  that is always on anyway. In-process `@Scheduled` is simpler and co-located with
  the state it reads.

## Consequences

- **The host must stay always-on.** A scheduled sender only works on a process that
  is up 24/7 — which the deployment already is, and which
  [ADR 0011/0012-class hosting](0012-single-node-self-hosting.md) commits to
  (single-node, no scale-to-zero). This reinforces, rather than complicates, the
  hosting decision.
- **One job, hourly, idempotent and deduped.** It is read-only against the domain,
  sends through the Web Push port, and prunes dead subscriptions on a `410 Gone`.
- **The "no scheduler" language is amended,** not contradicted: the *review engine*
  remains schedulerless; the *reminder* is a separate notifier that computes nothing.
- **Any new app-open surface inherits both bookkeeping concerns**, and should. The
  rule is stated at the level of *opening Tucker*, not of which endpoint a screen
  happens to call, so a screen that wants the day's targets without advancing the
  cadence is the exception that has to justify itself. That rule is **convention,
  not mechanism**: nothing in code obliges a caller of `GET /api/check/{barcode}`
  to have read the summary first, so a client that skips it gets a stale Budget
  and no complaint. Tolerable while Tucker has one frontend;
  [#186](https://github.com/skrymer/tucker/issues/186) is where it would be made
  structural, by moving the catch-up onto the Check's own path.
- **A Check-only user is never nudged, and their Maintenance quietly holds.** Someone
  who scans in shops but stops logging keeps the cadence advancing, so no review is
  ever overdue; and below the logged-day floor the adaptive correction needs, each
  review holds the prior Maintenance ([ADR 0018](0018-adaptive-maintenance-averages-over-logged-days.md)).
  The Budget freezes and nothing says so. That is the limit of using "a review is
  overdue" as the proxy for "you have drifted away" — accepted here, because this
  Reminder is about the *review*; a logging-based nudge would be a different feature
  with a different trigger.

## References

- [`CONTEXT.md`](../../CONTEXT.md) — `Weekly Review` (lazy catch-up, "no
  scheduler"), `Weekly-Review Reminder`, `Push Subscription`, `Profile` (timezone +
  reminder hour).
- [0002 — business logic belongs in the backend](0002-business-logic-belongs-in-the-backend.md)
  — the reminder *reads* derived state the backend owns; it adds no new logic to the UI.
- [0012 — single-node self-hosting](0012-single-node-self-hosting.md) — the
  always-on assumption the scheduler relies on.
- [0022 — a Check states cost and return](0022-a-check-states-cost-and-return-and-never-labels-a-food.md)
  — the shopping surface that forced "showing up" to be defined.

