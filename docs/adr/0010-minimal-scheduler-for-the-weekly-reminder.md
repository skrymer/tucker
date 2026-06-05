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
- the user **hasn't opened the app today** (the absent-today gate), and
- it is the user's **local reminder hour** (their `Profile` timezone + chosen hour),
  so the push lands at a civilised time, not whenever the cron first notices.

**Dedupe.** Store a single `lastReminderSentAt`. Suppress if it is *after* the
latest review's date — i.e. we already nudged for the current overdue episode.
When the user finally opens the app, lazy catch-up writes a fresh review whose date
moves past `lastReminderSentAt`, and next week's episode becomes eligible again. The
existing review timeline *is* the cycle boundary; no separate counter.

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

## References

- [`CONTEXT.md`](../../CONTEXT.md) — `Weekly Review` (lazy catch-up, "no
  scheduler"), `Weekly-Review Reminder`, `Push Subscription`, `Profile` (timezone +
  reminder hour).
- [0002 — business logic belongs in the backend](0002-business-logic-belongs-in-the-backend.md)
  — the reminder *reads* derived state the backend owns; it adds no new logic to the UI.
- [0012 — single-node self-hosting](0012-single-node-self-hosting.md) — the
  always-on assumption the scheduler relies on.
</content>
</invoke>
