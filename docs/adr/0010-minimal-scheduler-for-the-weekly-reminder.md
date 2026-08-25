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
- their local day has **reached** the **reminder hour** (their `Profile` timezone +
  chosen hour), so the push lands at a civilised time, not whenever the cron first
  notices.

**Dedupe.** Store a single `lastReminderSentOn` — the user's local *day* the last
reminder went out on. Suppress if it is *after* the latest review's date — i.e. we
already nudged for the current overdue episode. When the user finally opens the app,
lazy catch-up writes a fresh review whose date moves past `lastReminderSentOn`, and
next week's episode becomes eligible again. The existing review timeline *is* the
cycle boundary; no separate counter.

## Clocks the rule has to survive (amended — issue #96)

Two of the gates above are about *the user's day*, and both were originally written
as if a day were a tidy thing.

**A two-hour window, not a matching hour.** An equality test on the local hour
assumes every wall-clock hour occurs. On a spring-forward Sunday one does not — New
York goes 01:59:59 straight to 03:00 — so a user who picked 02:00 would silently
lose that week's nudge. The gate therefore spans the reminder hour *and the hour
after it*: two hours, because a clock never jumps by more than one, so that is the
smallest widening that survives the gap.

**Small is the other half of the decision**, and the first attempt at this widened
the gate to the whole rest of the day. Three things argued it back down:

- *It breaks the promise the hour makes.* Picking 09:00 is a request not to be
  pinged at 23:00. Once eligibility runs to midnight, only the dedupe keeps a nudge
  near the chosen hour, and the dedupe is empty until something is delivered.
- *"They'd have opened Tucker by then" is false.* The reasoning for the open window
  was that being owed a nudge all day is unreachable, since coming back stands it
  down. But **`/profile` does not read the daily summary** — and `/profile` is the
  only screen that switches reminders on. Enable them at 22:40 while a week overdue
  and the 23:00 tick fires, twenty minutes after asking for 9am.
  ([#192](https://github.com/skrymer/tucker/issues/192) closes that gap separately.)
- *Retries are not free.* The send is stamped only once a device actually takes it,
  so an endpoint that keeps failing is retried on every eligible tick. Each attempt
  was a fresh HTTP client inside the transport, and one failure shape — a *refused*
  connection — leaked its threads and socket permanently
  ([#193](https://github.com/skrymer/tucker/issues/193)). Fifteen attempts a day
  instead of one turned a slow leak into a fast one. #193 has since been fixed — the
  sender owns one client for its lifetime, so no attempt strands anything — but that
  removes the multiplier, not the argument: a retry that cannot succeed is still cost
  without benefit, and the narrow window is what keeps it to one.

So the window keeps exactly one retry, an hour later, and the **dedupe** is still
what guarantees a single nudge per episode within it — which is why the dedupe had
to be made sound first. Worth re-checking under F10, where a tick fans out across
every User in turn.

**That re-check, done (F10 slices 4 and 5).** The tick iterates Users and gives each
one its own turn through `runAs` ([ADR 0021](0021-every-row-is-owned-by-one-user.md)),
and every gate above now reads that User's own row. Slice 4 brought the loop and the
*review* half — whether somebody is overdue is asked of their own reviews and their own
Weight Measurements — and slice 5 scoped the rest: the Profile that resolves the
timezone and the hour, the Push Subscriptions the nudge fans out to, and the reminder
state holding the last-seen day and the per-episode dedupe.

The intermediate state between those two slices is worth recording, because it is what
"one shared row" costs when the rule is stated per person: a nudge fanned out to every
device in the installation rather than its owner's, and a 410 from any of them pruned
that device; one User opening Tucker stamped the shared last-seen day and silenced
everyone's absent-today gate; and the first send of a tick stamped the shared dedupe,
suppressing every later User in the same episode — a single nudge per *installation*
per episode, where this ADR specifies one per User. None of it was ever reachable in
production, which holds exactly one User until the second is invited in the final
slice, and the loop arrived a slice early only because scoping the reviews is what
forces a security context onto the cron thread.

**A device two people share follows whoever opted in last.** A Web Push endpoint is
issued by the browser and is globally unique by nature, so it stays globally unique in
the database while everything around it went per User. Subscribing an endpoint another
User holds therefore *claims* the device rather than failing, and the reminders that
land in that tray are the new owner's. It is a rule about devices, not a gap in the
scoping: there is one tray, and the person who just asked for reminders is the one
standing in front of it.

It is also the only place in Tucker where a row changes owner, so it is spelled as one
statement — an upsert whose conflict target is the endpoint — and the repository method
is called `claim` rather than `save`. Written instead as a lookup and a branch, the
transfer hid inside an ordinary-looking write, needed an unscoped read to justify, and
left a window between the two in which the row could change hands.

**A failing turn is one User's, not everyone's.** The tick catches a turn that throws,
logs it naming whose it was, and carries on. Independence is the whole premise of
per-User turns, and without it the blast radius of one exhausted connection or one
unreadable row would depend on where its owner happened to sort by id. It costs
nothing in retries: a caught turn stamps no send, so that User stays eligible and gets
exactly the one retry an hour later the narrow window already allows.

**A day, not an instant.** The dedupe compares the last send against a review date,
which is a local day. Recording the send as an instant meant re-deriving *its* day in
whatever timezone the `Profile` carries at the moment the comparison runs — so a
user who moved east after being nudged near midnight could have that send re-read as
the following day, push it past the review it belonged to, and lose the next episode
entirely. Both sides are now stored days, written once and never recomputed, so
changing timezone cannot move either of them.

Which is not the same as saying the two days are measured by one clock, and they are
not. The review's date is the **client's** local day (ADR 0014 — the client owns
today), while the reminder stamps the day in the **`Profile`'s** timezone, and that
timezone is a snapshot the frontend writes only when reminder settings are saved. A
user who relocates and doesn't revisit `/profile` has the two disagreeing by up to a
day until they do.

That disagreement is not cosmetic, and it long predates this issue. If the `Profile`
zone runs *ahead* of the device actually in the user's hand, the nudge is stamped on
the day after the review it produced — and "after the review" is exactly what
suppresses the next episode. Nothing then clears it: only a send moves one side and
only an app-open moves the other, and the suppressed thing is the nudge that would
have caused the app-open. One stale timezone and the reminder is silent for good.

So the comparison allows **one day of slack**. Real episodes are seven days apart, so
spending one of them on tolerance cannot mask a genuine second nudge, while getting
it wrong is unrecoverable. That is a repair for a skew that should not exist, not a
reason to keep it: recording *which episode* was nudged (the `latestReviewOn` current
at the time) would need no clock at all. It was not done here because "never nudged"
and "nudged before any review existed" are both the absent value, so identity alone
cannot tell a fresh user from a nudged one and would need a second column to say
which. Worth revisiting if the two clocks are ever unified.

## What counts as showing up (amended — issue #174)

The firing rule has two gates that both mean *the user came back*: the review is
**≥ 7 days old**, and they **haven't opened the app today**. Those are not
independent, and the second one is never reached.

**Opening Tucker runs the due review.** Lazy catch-up sits on the daily-summary
read, and its setup gate is the same predicate the reminder's is. So a request that
performed that read has already written a review dated today, and
`ReviewCadence.isOverdue` answers *no* before the absent-today gate is consulted.

*Corrected (issue #96):* this section originally said **every** app-open surface
performs that read. Only `/` and `/check` do; `/profile`, `/foods` and `/review` do
not. The conclusion holds for the case #174 was actually about — a Check is a
summary reader, which is the whole point — but "any screen" was never true, and the
gap has teeth on `/profile`, the one screen where reminders are switched on
([#192](https://github.com/skrymer/tucker/issues/192)).

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

## What the nudge says (amended — issue #250)

The nudge shipped as one sentence — *"Open Tucker to log today and refresh your
calorie budget"* — because there was one shape of Tucker user. F12 made **Calorie
Tracking** optional, and that sentence names two things a weight-only user does not
have: food they log, and a Calorie Budget to refresh, which since
[ADR 0024](0024-a-weekly-review-carries-intake-targets-only-when-they-can-be-corrected.md)
their review genuinely does not carry. So the copy varies with the setting, and a
weight-only user is asked instead to log their weight and refresh their trend.

**Only the copy.** Every gate above is untouched, and that is the decision rather
than an omission: a `Weekly Review` comes due on the same seven-day cadence whatever
a user tracks, because its first job — recording the `Trend Weight` — is the job
neither setting removes. The nudge is about the review, so the review's cadence is
still what earns it. A test says so out loud, because a copy split is exactly the
kind of change a later reader assumes implied a gate split.

**It is chosen inside a user's turn**, from the `Profile` that turn already read to
resolve the timezone and the hour — so a tick serving several people says the right
thing to each. Resolved once for the tick, whoever sorted first would decide what
everybody else's phone said.

**It stays two constants, not a template.** The nudge is still never personalised and
never a guilt-trip (`CONTEXT.md`), and it is still *text only* — the service worker
supplies the icon, the badge, the collapse tag and the destination, for the same
reason as before (issues #178, #189). A second payload changes what is said, not who
says where it lands.

**What it does not fix** is the trigger, and the gap is worth naming because the new
copy makes it easier to misread. The reminder fires on absence from the *app*, not
from the scale, so a weight-only user who opens Tucker daily and never steps on it is
never nudged while their Trend Weight goes stale — the same shape of limit ADR 0010
already records for a Check-only user, and the same answer: that is a **Weigh-in
Reminder**, a different trigger and a different feature (F13).

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
  sends through the Web Push port, and prunes a dead subscription — one the push
  service reports `410 Gone`, or one whose stored keys will not decode, which is
  just as permanent and was previously retried forever.
- **One job means one thread, so every send is time-bounded.** The scheduler is
  single-threaded by design (it has nothing to run concurrently with), which makes an
  unbounded wait on a push endpoint a whole-feature outage rather than one lost
  nudge: a service that accepts the connection and never answers would hold that
  thread until the app restarts. Each send therefore waits a fixed number of seconds
  and no longer. This is a documented bound rather than a tested one — the failure
  needs a deliberately hung server, and the library offers no seam to fake one
  without also faking the transport this ADR treats as external.
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
- [0024 — a Weekly Review carries Intake Targets only when they can be corrected](0024-a-weekly-review-carries-intake-targets-only-when-they-can-be-corrected.md)
  — why a weight-only user has no Calorie Budget for the shipped copy to name.

