# Every row is owned by exactly one User, scoped implicitly through the security context

With identity established ([ADR 0020](0020-identity-comes-from-cloudflare-access.md)), the
question becomes what is *whose*. `CONTEXT.md` had already written a cheque here, before
multi-user was real: barcode-scanned Foods were to be "shared product data — global, one
per barcode, identical for every user", hand-entered Foods and Recipes private, and
correcting a shared Food would *fork* a private copy. F8 shipped, so the global `barcode`
uniqueness that model assumes is live in production data.

That model does not survive contact with two actual users:

- **The delete rule leaks.** A Food referenced by an Entry cannot be deleted, and the
  refusal *names what references it*. If Alice scans a product and Bob logs it, Alice's
  delete either lies or tells her what Bob eats.
- **The fork never heals.** Alice corrects bad provider macros and gets a private copy;
  Bob keeps the wrong global row forever, with no signal and no propagation.
- **F8's third outcome is unclassified.** "Miss → manual entry with the barcode
  pre-filled" produces a hand-entered Food *with* a barcode. Global or private? If
  private, a globally-unique `barcode` index breaks the first time two users hand-enter
  the same missing product.

And the benefit it was buying is largely already banked elsewhere: the reason to share
Food *rows* was to avoid re-querying Open Food Facts, which
[ADR 0006](0006-provider-agnostic-nutrition-lookup.md)'s shared per-barcode **lookup
cache** already delivers, independent of who owns a row.

## Decision

**Every row belongs to exactly one User, and nothing is shared.** Foods, Recipes, Entries,
Weight Measurements, Goals, Weekly Reviews, Profiles, and Push Subscriptions all carry an
owner. `app_config` (the VAPID keypair) stays global — it is Tucker's, not a user's.

- **No shared catalog.** `food.barcode` becomes `UNIQUE(user_id, barcode)`; the same
  product may exist once per User. Scanning something another User has already scanned is
  still instant, because the *lookup* is cached across Users — but what it produces is the
  scanning User's own Food, correctable without touching anyone else's.
- **Scoping is implicit, read from the Spring Security context.** Repository signatures do
  *not* carry a `userId`; a constructor-injected `CurrentUser` supplies it from the
  principal. Passing an id explicitly would force callers to pass *an* id, not the *right*
  one — this removes the choice entirely. The dependency is injected rather than reached
  for statically, so it stays visible in the constructor and stubbable in tests.
- **A foreign id is indistinguishable from a missing one.** Because reads are scoped,
  `findById` returns null for another User's row and the endpoint answers **404, never
  403** — so an id probe cannot confirm that a row exists. This covers request bodies too:
  a `foodId` belonging to someone else fails through the same path.
- **Per-user uniqueness.** `profile` loses `CHECK (id = 1)`; `weight_measurement
  .measured_on`, `weekly_review.reviewed_on`, and the single-active-`goal` partial index
  all become unique *per user*; `reminder_state` becomes per user.
  `push_subscription.endpoint` stays **globally** unique — a browser endpoint is globally
  unique by nature, so if two Users ever share one browser profile, re-subscribing
  reassigns that device to whoever opted in last, which is the correct behaviour anyway.
- **The reminder scheduler acts on behalf of each User in turn.** It runs on a cron thread
  with no SecurityContext, and its job is inherently cross-user. One system-level query
  (`UserRepository.findAll()` — the `user` table is not user-owned) drives a loop that
  establishes a context per User through a single narrow `runAs(user) { … }` helper. The
  cron path therefore exercises exactly the same scoped code as a real request, rather
  than a parallel set of queries that can drift.
- **The guarantee is a cross-user isolation suite**: seed two Users, assert every read
  returns only the caller's rows and every write against a foreign id answers *exactly
  as it answers for an absent one* — which is a 404 where the endpoint 404s on a
  missing row, and a 204 where it already deletes one idempotently. See the
  status-code consequence below before writing those assertions.
- **Sharing is a future feature, not a gap.** Sharing a Recipe with another User is
  deliberately deferred; when it lands it should be copy-on-share or a real per-object
  grant, and *that* is when Spring Security's ACL module becomes the right tool.

## Alternatives rejected

- **Honour `CONTEXT.md`'s shared barcode catalog with fork-on-correct.** Rejected for the
  three failures above, and because its main benefit is already provided by the shared
  lookup cache. Un-sharing a global catalog later would be a data migration; sharing a
  private one later is additive — so this direction is also the cheaper mistake.
- **A household shared catalog** (Foods and Recipes shared inside a membership group,
  everything else private). The best fit if two people cook together — and it adds a
  *second* partitioning concept to every catalog query plus a membership model, for a
  benefit better delivered later by explicit Recipe sharing.
- **Explicit `userId` parameters on all 46 repository methods.** Honest and greppable, and
  it keeps repositories usable off a request thread. Rejected because it makes the owner a
  value a caller can get *wrong*, and it threads an id through every layer that the
  security context already carries.
- **Implicit jOOQ query rewriting** (an `ExecuteListener` injecting `user_id = <current>`
  into every statement). A forgotten filter becomes impossible rather than tested-for —
  but it is invisible control flow, awkward around joins, aggregates, and inserts, breaks
  outright for the request-less scheduler, and debugging a misfire is miserable.
- **`@PostAuthorize` / `@PostFilter` / `spring-security-acl` as the enforcement
  mechanism.** All are *post-hoc*: they evaluate on already-loaded objects and cannot
  become a SQL predicate. `@PostFilter` would load every User's rows and discard them in
  memory. With implicit scoping the uniform rule is already enforced in SQL, so
  per-endpoint annotations would restate one rule 34 times. ACL's four-table schema
  expresses "arbitrary grants to arbitrary principals" — which is sharing, not sole
  ownership, and a single foreign key expresses sole ownership completely.

## Consequences

- **The rule is "a foreign id answers exactly as an absent one", and 404 is only
  what that comes to for a read.** Stated as a status code it misleads: `DELETE
  /api/foods/{id}` has always answered **204** for an id nobody owns, because
  deleting is idempotent — so a foreign id must answer 204 too, and a 404 there
  would be the very oracle this forbids. Scoping delivers it for free: the scoped
  `findById` returns null and the existing early-return does the rest. The same
  reasoning pushed the other way for a Recipe ingredient, which used to reject an
  unknown `foodId` with a 400: a foreign one had to match it, and matching it at
  **404** is better, because that is what `POST /api/entries/weighed` already
  answers for the same mistake and it leaves 400 to mean malformed input alone.
  Read the rule off the endpoint's existing answer for "no such row", not off this
  paragraph's example.
- **Repositories gain a hidden input.** `findByDate(date)` returns different data
  depending on invisible state. Mitigated by constructor injection (not a static
  `SecurityContextHolder` call per method) and by the isolation suite.
- **Every scoped statement carries the owner predicate, reachable or not.** A statement
  whose only caller has already resolved the id through a scoped read still gets
  `AND user_id = …`. Reachability is deliberately *not* audited per method: deciding
  case by case which statements need scoping is exactly the per-site reasoning implicit
  scoping exists to remove, and it makes the next caller of that method the one who gets
  it wrong. Uniform is the cheaper rule, so the exceptions are not worth documenting
  individually.
- **Repository and service tests need a SecurityContext**, since they call beans directly
  with no HTTP in play.
- **Duplicate product rows across Users are accepted** — the cost of no shared mutable
  state, and cheap in a single-node SQLite database.
- **The migration is safe to land incrementally**, because production contains exactly one
  User until the second is invited: an unscoped query cannot leak anything before then.
  Inviting the second User is therefore the *last* slice, gated on the isolation suite
  being green.
- **`user_id` is nullable in the database, though the model says it never is.** SQLite
  refuses `ADD COLUMN ... NOT NULL ... REFERENCES` against a table **that already holds
  rows**, and only then — so the stricter migration passes every test, every smoke and the
  jOOQ codegen schema, and fails against the single database that matters. The foreign key
  therefore lands first, and `NOT NULL` is folded into the per-user-uniqueness rebuilds
  above — `profile` losing `CHECK (id = 1)`, `weight_measurement` and `weekly_review`
  losing their global `UNIQUE` — which have to rewrite those tables anyway. Until then the
  invariant is held by the repositories, and an unowned row is *loud* rather than
  dangerous: from the scoping slices on it is invisible to the very User who created it.
  A rebuild that finds one **deletes** it: an unowned row is already invisible to
  everybody, so dropping it loses nothing observable, and it is the only choice that
  guesses no ownership.
- **What a rebuild actually costs — corrected in slice 4.** This ADR originally priced
  every rebuild at a non-transactional migration plus `PRAGMA foreign_keys = OFF` (which
  the one pooled connection would then carry for the life of the JVM). That is the general
  12-step recipe, and it is **wrong for these tables**. Step 1 turns foreign keys off so
  that dropping the old table does not strand rows in tables that *reference* it — and
  nothing references `weight_measurement`, `goal`, `weekly_review`, `profile` or
  `reminder_state`. They are pure children of `user`; the only `REFERENCES` clauses in the
  schema point at `food` and at `user`. So foreign keys stay enforced throughout, and
  since that `PRAGMA` (a no-op inside a transaction) was the only thing forcing
  `executeInTransaction=false`, the rebuild runs inside Flyway's transaction like any
  other migration — Flyway's `SQLiteDatabase.supportsDdlTransactions()` is `true`. **The
  rule is "does anything reference this table?", not "is this a rebuild?"** V11 rebuilt
  three tables this way against real production-shaped data; slice 5's `profile` and
  `reminder_state` rebuilds are the same shape. `PerUserUniquenessMigrationTest` asserts
  the reference graph, so the premise fails loudly the day a new table points at one of
  them rather than being quietly assumed.
- `ReminderScheduler` gains impersonation machinery. It is confined to one helper used
  only by the scheduler, and its misuse elsewhere would be a review failure.

## References

- [`CONTEXT.md`](../../CONTEXT.md) — **User**, **Food** (per-User ownership, no shared
  catalog), and the ownership relationship.
- [0020 — identity comes from Cloudflare Access](0020-identity-comes-from-cloudflare-access.md)
  — where the principal this scopes against comes from.
- [0006 — provider-agnostic nutrition lookup](0006-provider-agnostic-nutrition-lookup.md)
  — the shared per-barcode lookup cache that makes a shared *catalog* unnecessary.
- [0001 — domain-driven design](0001-domain-driven-design.md),
  [0013 — test coverage policy](0013-test-coverage-policy.md) — the rich-domain and
  deep-module conventions this follows.
