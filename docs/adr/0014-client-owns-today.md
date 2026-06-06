# The client owns "today"; the server never stamps domain dates on its own clock

Tucker is single-user today, but every user lives in a timezone, and "today" is
their **local** day — the day their food, weight, and Budget belong to. The server
runs in its own zone (UTC in production and the smoke stack, per
[ADR-adjacent #84](https://github.com/skrymer/tucker/pull/84)). For roughly the
width of the UTC offset each day, the server's calendar day and the user's disagree.

`/summary?date=` and `/weight` already honour this: the client supplies its local
date and the server acts on it (`CONTEXT.md` › **Weight Measurement**). But the Goal
lifecycle (`create`/`replace`/`deactivate`) and the manual weekly-review run stamped
their forced recompute on the **server's** `LocalDate.now()`. That split is what made
the `goal-recompute-budget` smoke flake (#84): a Goal-change review landed on the
container's "tomorrow" while the UTC runner read "today" and found nothing. #84 pinned
both clocks to UTC as a safety net; this decision removes the *root cause* so
determinism no longer leans on that pin, and fixes the model for the multi-user
future where every user has their own local day.

## Decision

**The client owns "today." The server never stamps a domain date on its own wall
clock.** Any endpoint that *stamps or recomputes* a domain date takes the client's
local date and acts on it:

- `POST /api/goal` (create/replace) and `DELETE /api/goal` (deactivate) — the forced
  Weekly-Review recompute (#61) is stamped on the client's day, so the lifted Budget
  lands on the user's today.
- `POST /api/weekly-review` (manual run) — the minted review is stamped on the
  client's day.

The client date is carried as `clientToday` (request body for the POSTs, query param
for the DELETE), exactly as `/weight` already does, and resolved by one shared
`UserToday` component. It trusts the client's date but only within **±1 day** of the
server's — a real timezone shifts the local date by at most a day, so anything beyond
that is a misconfigured (or untrustworthy) client clock and is rejected. When the
client supplies nothing, it falls back to the server's date.

**The server clock is a narrow, injected seam, not a default.** The domain services
no longer default their `today` parameter to `LocalDate.now()`; the date is always
passed in, so a missing one is a *compile error*, not a silent server-clock stamp.
The server's own "now" is read only through `UserToday`, which wraps a single
injectable `java.time.Clock` bean (`Clock.systemUTC()`), and is used for two
read-only purposes — **never to stamp a persisted domain date**:

1. validating a client-supplied date is plausible (the ±1-day guard), and
2. supplying "today" to a read-only projection that has no client date to honour —
   `GET /api/goal/progress`, whose observed-pace figures are computed as of today
   but persist nothing (via `UserToday.serverToday()`).

The future Weekly-Review reminder cron (#82) is the one *other* legitimate reader
of a server clock — a server-initiated tick with no client, which applies the
user's `Profile` timezone to the clock's instant itself. It reuses this same
`Clock` bean (no duplicate seam), and freezing the bean lets tests and the `smoke`
profile control time.

## Alternatives rejected

- **Keep the server-clock stamp, rely only on the #84 UTC pin.** Leaves the runner
  -vs-server skew one env var away from returning, and bakes the wrong model for
  multi-user. The pin stays as a belt; this is the suspenders.
- **A `ZonedDateTime`/`Instant` everywhere with a stored IANA zone.** Heavier than the
  problem: the user already knows their local date and can send it, just as `/weight`
  proves. The Profile timezone is reserved for the reminder cron, which genuinely
  needs a zone with no client present.
- **Default the `Clock` bean to the system zone.** Less deterministic and couples the
  plausibility guard to the `TZ` env var. UTC matches the #84 pin and the existing
  `InMemoryBarcodeLookupCache` clock; the reminder cron is zone-agnostic because it
  applies the Profile zone to the instant.

## Consequences

- A Goal change or manual review recompute lands on the user's local day regardless
  of the server's zone — proven by a frozen-clock integration test
  (`GoalClientTodayApiTest`) and a real-stack smoke.
- The `clientToday` contract is now uniform across `/weight`, `/goal`, and
  `/weekly-review`; the frontend sends its `localToday()` on each.
- The #84 UTC pin is retained as a safety net, not a crutch.

## References

- [`CONTEXT.md`](../../CONTEXT.md) — **Weight Measurement** (the client supplies
  "today"), **Weekly Review** (the Goal-change recompute).
- [0002 — business logic belongs in the backend](0002-business-logic-belongs-in-the-backend.md)
  — the server still owns the recompute; only *which day* is the client's input.
- #84 — the UTC pin this hardens beyond. #82 — the reminder cron sharing the `Clock` seam.
