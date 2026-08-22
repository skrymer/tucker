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
  enforces it, live in `feature-sign-off` gate 2.

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
- Commands (run in `backend/`): `./gradlew build` (compile + detekt + fast suite) ·
  `detekt` · `e2eTest` · `generateOpenApiDocs` · `mutationTest`.
- **A controller change is not done until the spec is regenerated**:
  `./gradlew generateOpenApiDocs`, then `pnpm exec nuxt prepare` in `frontend/`.
  `OpenApiSnapshotTest` fails the build if you forget, naming both commands.

## Gotchas (each cost a build or a debugging session once)

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
- **Direct-bean tests need `@WithTuckerUser`.** MockMvc requests are signed in for you by a
  `MockMvcBuilderCustomizer`; a test that touches a scoped repository directly is not, and
  fails naming the repository rather than the missing identity.
- **The backend image has no `sqlite3`** (it is a JRE image) — inspect a container database
  from a throwaway `python:3-slim`, and copy the `-wal` file too or you read a stale snapshot.
- **The SEVERE "Unknown function: datetime('now')" during jOOQ codegen is benign noise.**

## Exit

When the change works and is tested, run **`feature-sign-off`** (verify → simplify →
mutation-test → code-review → check-adrs) before committing. Gate 3 is where the tests
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
