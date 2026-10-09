---
name: backend-dev
description: The build-and-test workflow for the Tucker Kotlin/Spring backend (Spring Boot 3 + jOOQ + SQLite, in backend/). Use when building or changing ANY backend functionality — a domain type, service, repository, controller, migration, or its tests. Sets the architecture rules, the five test layers, the commands, and the known gotchas, and routes to tdd, mutation-test, and feature-sign-off for detail. The frontend counterpart is frontend-dev.
---

# Backend dev (Tucker)

The playbook for any change under `backend/`. Read it first, build test-first, hand off to
`feature-sign-off` at the end. It **links** the canonical docs (ADRs, `CONTEXT.md`) — it does
not restate them.

## Architecture rules (honour these; the links carry the why)

- **Rich domain model.** Invariants live in the domain type — an `init` block or a factory —
  and behaviour lives with the data it acts on. Services orchestrate across aggregates; they
  are never the home of the rule. The domain layer stays free of jOOQ and Spring; repositories
  map records to domain objects at the boundary. (ADR 0001.)
- **Every derived number is computed here.** Domain verdicts and derived state ship as plain
  API fields; the frontend presents them and re-derives nothing. A new rule is a backend
  change first. (ADR 0002.)
- **Speak `CONTEXT.md`.** It is the ubiquitous language — domain code uses exactly those
  terms, and a change to the model updates it in the same commit.
- **Scoping is implicit.** No repository signature carries a `userId`; a constructor-injected
  `CurrentUser` reads it from the security context, so there is no id to pass wrongly. A
  foreign id answers **exactly** as an absent one — the status code must never become an
  existence oracle. (ADR 0020, ADR 0021.)
- **The client owns "today".** Domain services take the date as a required parameter — never
  defaulted to `LocalDate.now()`, so a missing one is a compile error. Where the server does
  need now, it reads an injected `Clock`. (ADR 0014.)
- **Absence on the wire is an explicit `null`.** A nullable Kotlin DTO field is serialized as
  `null` and described `nullable` in the spec by a `ModelConverter` — derived from the type,
  never hand-annotated, and never suppressed with `@JsonInclude(NON_NULL)`. (ADR 0023.)
- **Config that must be right has no default.** `tucker.access.*` and the `ownerEmail` Flyway
  placeholder are undefaulted on purpose: a value nobody can guess is better as a boot failure
  than as a wrong fallback — ADR 0020 counts a misconfigured deploy among its costs, and this
  is how that cost is paid loudly. State them in every boot path you add; `build.gradle.kts`
  and `deploy/README.md` step 6 are where the existing ones live.
- **Doc comments are brief, present-tense, and non-obvious**, and never a changelog — a KDoc
  earns its place by saying what the signature doesn't. The full rule, and the sweep that
  enforces it, live in `feature-sign-off` gate 1.

## Test strategy — five layers, test-first

| Layer                     | Tool · env                                  | Where                        |
| ------------------------- | ------------------------------------------- | ---------------------------- |
| Deep domain modules       | JUnit 5 + `kotlin.test`, no Spring          | `src/test/kotlin/.../domain/` |
| Domain services           | JUnit 5, real collaborators                 | `.../service/`               |
| Persistence + migrations  | `@SpringBootTest` + real SQLite             | `.../persistence/`           |
| API, security, wiring     | `@SpringBootTest` + MockMvc                 | `.../api/`, `.../security/`  |
| The deployable artifact   | Testcontainers vs the Docker image          | `.../e2e/`, `./gradlew e2eTest` |

- One test at a time, RED first (the `tdd` skill). A **deep module** (an interface worth
  specifying) gets its own test; **thin glue is covered by the integrated test** — a
  delegating controller and scheduler wiring get no standalone test, and mocking internal
  collaborators to give them one is the anti-pattern. (ADR 0013.)
- **A rule no behaviour can break still gets a RED — make the rule executable.** Some
  ADR rules hold "reachable or not" (ADR 0021: every scoped statement names the owner,
  even when a scoped read upstream already makes it safe). No test through a public
  interface can fail on their absence, so Probity rightly refuses the edit, and asking
  to have it waved through is the wrong move. Write a guard test that checks the rule
  itself: `LinkTableOwnerPredicateTest` records the SQL jOOQ executes (an
  `ExecuteListenerProvider` bean in a `@TestConfiguration`) and fails on a link-table
  DELETE that never names `user_id`; `RunAsCallSitesTest` does the same for `runAs`
  call sites. Extend the existing guard before writing a new one. jOOQ renders SQLite
  identifiers **unquoted** (`delete from food_tag …`), so match that or the RED fails
  for the wrong reason.
- Commands (run in `backend/`): `./gradlew build` (compile + detekt + fast suite) ·
  `detekt` · `e2eTest` · `generateOpenApiDocs` · `mutationTest`.
- **A controller change is not done until the spec is regenerated**:
  `./gradlew generateOpenApiDocs`, then `pnpm exec nuxt prepare` in `frontend/`.
  `OpenApiSnapshotTest` fails the build if you forget, naming both commands.

## Gotchas (each cost a build or a debugging session once)

- **On SQLite, `onConflictDoNothing().returning(X).fetchOne()` is not null on a conflict.**
  jOOQ answers `RETURNING` from the connection's `last_insert_rowid()`, so a losing insert
  is handed whatever that connection inserted last — possibly another table's row. Use
  `.onConflictDoNothing().execute()` and read the row back by its key, as
  `UserRepository.insertIfAbsent` does.

- **A test that the code chose a value over SQLite's default must start where the two
  differ.** Left alone the database often lands on the same value by itself, and the test
  passes with the code deleted. #385: a conflict test needs a *third* insert between the
  colliding pair, or the collided row is the last insert. #455: a "stored under the id it
  was built with" test must take one `nextId()` it never uses first, or AUTOINCREMENT
  hands out the same id — seven such tests passed with `rec.id = …` removed.

- **The fast suite's database outlives the run** (`build/test-tucker.db`), and the
  signed-in `tester` is provisioned by whichever request reaches it first. An assertion on
  "the first" row, draw or statement therefore depends on what ran before: key it by table
  or name, and ablate a fix on a copy without `build/` (#455's `take(1)` guard passed on a
  stale DB and failed on a fresh one). A test that cannot be `@Transactional` commits its
  data into that same file: sign it in as a fixed User of its own (a minted assertion),
  delete its rows in `finally`, and run the full suite twice on one DB before committing —
  #455's version created a Tag as `tester`, and pitest's baseline, in another order, failed
  fifteen Tag-list tests without a mutant.

- **Run the suite as `TZ=Etc/UTC ./gradlew build`** — it flakes in the UTC-evening window on a
  Brisbane host, where the two calendar days disagree.
- **A green `./gradlew build` can be a cached one.** After a config or Spring-context change,
  re-run with `--rerun-tasks` before trusting it; CI won't have the cache.
- **`src/test/resources/application.yml` shadows main entirely** in `@SpringBootTest` — it does
  not merge. A new main-only key must be restated there or every context fails to load.
- **A test reading a repo file through `java.io.File` is invisible to Gradle.** Without an
  `inputs.file` on the task, editing only that file leaves `:test` UP-TO-DATE and the guard
  silently never runs — precisely the case it exists for.
- **Flyway migrations: no `;` inside a comment**, and no `CHECK` in an `ADD COLUMN`.
  `prepareJooqDatabase` splits the SQL naively on `;`, and codegen dies naming neither.
- **Never edit an applied migration** — the checksum changes and the next `docker compose up`
  refuses to start against your dev volume. Repair the stored checksum rather than wiping data.
- **Widening a constraint means rebuilding the table**, and the question to ask is "can
  everything that references it be rebuilt alongside it?", not "is this a rebuild?". An
  unowned row is **adopted, never deleted**, guarded on there being exactly one User.
  (ADR 0021.)
- **A rule that reads the client's day needs a test where the client's and server's days
  differ** — `clientToday` = server + 1 and `date` = client + 1. In MockMvc the two agree, so
  every other test passes whichever day the code resolved. Extending a rule to a sibling
  endpoint means porting each of the sibling's tests: #444 copied all but this one, and only
  pitest (`getClientToday → null` alive) noticed.
- **Direct-bean tests need `@WithTuckerUser`.** MockMvc requests are signed in for you by a
  `MockMvcBuilderCustomizer`; a test that touches a scoped repository directly is not, and
  fails naming the repository rather than the missing identity.
- **The backend image has no `sqlite3`** (it is a JRE image) — inspect a container database
  from a throwaway `python:3-slim`, and copy the `-wal` file too or you read a stale snapshot.
- **The SEVERE "Unknown function: datetime('now')" during jOOQ codegen is benign noise.**

## Refactor step — Detekt names the smell

`backend/detekt.yml` fails `./gradlew build` through the type-resolving `detektMain` /
`detektTest` (`check` runs them; the pre-commit hook runs the faster plain `detekt`, which
misses the type-resolution rules). Each hit is a smell; fix it with the catalog move
[tdd's `refactoring.md`](../tdd/refactoring.md) names, chosen to make the code read better —
never by shaving lines, never with `@Suppress` or a baseline. The commit names the move.
The limits are `detekt.yml`'s, stated once there. The pre-commit hook lints the whole
backend against the *working-tree* `detekt.yml`, so tightening it means committing each
fix with `HEAD`'s config parked and landing the new thresholds last.

| Rule | Smell |
| --- | --- |
| `LongMethod` (tests exempt) | Long Function |
| `CognitiveComplexMethod`, `NestedBlockDepth`, `ComplexCondition`, `NestedScopeFunctions`, `ReturnCount` (guard clauses exempt) | Nested conditionals |
| `LongParameterList` | Long Parameter List — on a constructor, a class with more than one job (Large Class) |
| `LargeClass` (tests exempt), `TooManyFunctions` | Large Class |
| `StringLiteralDuplication` | Duplicated Code |
| `DataClassShouldBeImmutable`, `VarCouldBeVal` | Mutable Data |
| `UnusedImports`, `UnusedPrivate*` | Dead Code |
| `UnnecessaryAbstractClass` | Shallow module — Replace Superclass with Delegate |
| `UnsafeCallOnNullableType` (`!!`), `UseRequireNotNull` | Make null impossible in the type. Else Introduce Assertion — but `checkNotNull` throws `IllegalStateException`, which `ApiExceptionHandler` answers 409, so on a request path it misreports a server fault; keep it to boot-time code |
| `UnnecessaryLet`, `UseOrEmpty` | Inline Function / Substitute Algorithm (the idiom) |

How the moves land here:

- **A bean's collaborators → Extract Class**: move the assembly into a service (or a
  component it needs), so a controller reads HTTP → domain → HTTP. Keep each endpoint on
  its controller — the spec's tags and `operationId`s come from it, and moving one is a
  wire change `OpenApiSnapshotTest` will catch. **A controller's `@Transactional` must
  still cover every read left in the controller** — #455 moved Frequent Foods' ranking into
  `FoodService` and left `FoodDescriber`'s reads outside the transaction, green on every
  test. Pin it the way `FrequentFoodsReadTransactionTest` does: record the transaction each
  statement runs in and assert there is one.
- **Move Class out to a public domain type, and it owes its own test in the same change**
  (ADR 0013 rules 2 and 5) — the service tests that drove it while it was private are not
  its spec. #455's `AdaptiveWindow` was moved untested and gate 5 sent it back.
- **Introduce Parameter Object onto the domain value the group already is**
  (`LoggedIntake`, `WeighedPortion`, `BorrowedLog`); a fixture parameter no caller varies
  is Change Function Declaration, not an object.
- **A flat wire DTO** that no split can shorten is built by its own secondary constructor
  from the value it presents (`CheckResponse(product)`) — never nested, which moves the wire.
- **Pin a refusal's wording in its API test before moving the code that renders it**: a
  400/409 message is wire the spec cannot see. Probity refuses *tightening* a passing
  assertion; when it does, move the literal verbatim and check the diff instead.
- **A signature change under Probity: callers first.** Update the test call sites, let the
  build go red on the compile, then change the declaration.

## Exit

When the change works and is tested, run **`feature-sign-off`** (verify → simplify →
mutation-test → code-review → check-adrs → resolutions → verify) before committing. Gate 2 is where the tests
themselves get tested: `mutation-test` scopes pitest to the classes the change touched,
and every survivor gets one of its four verdicts.

## Related

`tdd` · `mutation-test` · `feature-sign-off` · `check-adrs` · `deploy-prod` ·
`frontend-dev` (the other half of a vertical slice) · [`CONTEXT.md`](../../../CONTEXT.md).
ADRs:
[0001](../../../docs/adr/0001-domain-driven-design.md) ·
[0002](../../../docs/adr/0002-business-logic-belongs-in-the-backend.md) ·
[0013](../../../docs/adr/0013-test-coverage-policy.md) ·
[0014](../../../docs/adr/0014-client-owns-today.md) ·
[0020](../../../docs/adr/0020-identity-comes-from-cloudflare-access.md) ·
[0021](../../../docs/adr/0021-every-row-is-owned-by-one-user.md) ·
[0023](../../../docs/adr/0023-absence-on-the-wire-is-an-explicit-null.md).
