---
name: mutation-test
description: Runs mutation testing over Tucker's fast test suites — StrykerJS over Vitest in frontend/, pitest over JUnit in backend/ — scoped to the source a change touched, then triages every surviving mutant. Use as gate 3 of feature-sign-off, or when the user asks to mutation-test a change, run Stryker or pitest, measure a mutation score, or check whether the tests would actually catch a bug.
---

# Mutation test (Tucker)

Coverage says a line ran. Mutation testing asks whether any test would have
**noticed it change**. The engine rewrites the source one mutant at a time and
re-runs the tests that cover it; a mutant that survives is a line no assertion
pins.

Two engines: **StrykerJS** over the Vitest suite in `frontend/`, **pitest** over
the fast JUnit suite in `backend/`. Run whichever stacks the diff touches — a
vertical slice usually means both.

**Browser and container layers are out of scope in both.** Playwright and the
Testcontainers e2e are far too slow to re-run per mutant. Gaps there (unanchored
aria-snapshot regexes, substring `getByText`, fixture defaults that can't occur in
production) are still found by hand.

## Run each sweep bounded, and one at a time

**Both sweeps go through `scripts/bounded-run.sh`**, which puts the command in a
memory-capped systemd scope:

```bash
scripts/bounded-run.sh --cap 10G -- pnpm exec stryker run --mutate "app/utils/csrf.ts"
scripts/bounded-run.sh --cap 8G  -- ./gradlew mutationTest -PmutationTargets='com.tucker.domain.Goal'
```

`bounded-run.sh` is Linux + systemd only; elsewhere it warns and runs unbounded, and
the config caps below are then the only guard.

This is not belt-and-braces. `systemd-oomd` kills on **user-slice** memory
pressure — it does not kill the process that grew, it kills a whole cgroup — so
an unbounded sweep does not fail alone, it takes the terminal and the Claude Code
session running in it. That happened twice (2026-08-23 and 2026-08-25); the
journal records `Killed .../vte-spawn-….scope due to memory pressure … being
63.62% > 50.00% for > 20s`. Inside a scope the kernel reclaims and, failing that,
kills within that cgroup only, and the failure reads as a dead worker rather than
a vanished session.

**Do not run the two sweeps concurrently.** Overlapping them is where the OOM came
from: they are separately affordable and jointly not. Sequential costs wall-clock
that a killed session costs anyway, plus the work in flight.

### Memory budget (measured on this repo, 30 GB machine)

Anonymous memory — page cache inflates `memory.peak` and is reclaimable, so it is
not what drives the pressure oomd watches.

| Config                      | Peak anon | Same 30-mutant sweep |
| --------------------------- | --------- | -------------------- |
| StrykerJS `concurrency: 4`  | **21 GB** | 49s — killed sessions |
| StrykerJS `concurrency: 2`  | 12 GB     | 49s                  |
| StrykerJS `concurrency: 1`  | **7.3 GB** | 41s                 |

`concurrency: 1` is the committed default and is **not** the slow option: four
workers thrashed against each other, so the small sweep was *faster* at 1, and a
721-mutant sweep runs 10m42s (~0.89s/mutant) against ~0.7s/mutant at 4 — ~29%
per-mutant for a third of the memory. Peak anon stayed **flat at 7.3 GB** across
those 721 mutants, and user-slice pressure held at `avg10=0.00`.

The floor is one Vitest worker holding a Nuxt environment (~4 GB) plus the Stryker
parent (~2.3 GB); there is no tuning below that. `testRunnerNodeArgs:
--max-old-space-size` was tried and **measured to change nothing** (7.3 GB with and
without) — Stryker's runner already pins Vitest to `pool: 'threads', maxWorkers: 1`,
so the heap that matters is not the main isolate's. Don't re-add it.

Backend heaps are capped to match: `org.gradle.jvmargs=-Xmx2g`, pitest minions at
`-Xmx1g` (unset, each would inherit a quarter of physical RAM), and the JavaExec
parent at 1 GB.

## Workflow

Identical for both stacks; only step 1 and 2's commands differ.

1. **Scope from the diff.** Mutating untouched source reports old debt as if this
   change caused it. Run the scoping command for the stack (below) **from the repo
   root**. Diff against `main` **without** `...`, plus untracked files: sign-off
   usually runs before the commit, so a three-dot range against `HEAD` reports
   nothing and the gate silently passes having mutated zero files.

   Empty list → that stack's source is untouched. Report **SKIP** for it.

2. **Run** the engine over that scope.

3. **Triage every survivor.** A score is not the deliverable — the verdict per
   survivor is. Each is exactly one of:
   - **Real gap** — the mutant changes behaviour a user could observe, in a
     module that owes its own test (a deep module, per ADR 0013). Write the
     missing test red-green (per `tdd`): confirm it fails against the mutant's
     behaviour before restoring the source, which is already correct.
   - **Killed by an out-of-scope layer** — the module is *thin glue*, whose red
     lives in a Playwright e2e, a real-stack smoke, or the Testcontainers e2e by
     ADR 0013 ("thin glue gets no separate test"). The engine can't see those
     layers, so these survive by construction. **Name the spec that kills it** and
     move on — writing a standalone unit test for glue would break the coverage
     policy, not honour it. If no spec kills it, it is a Real gap in that layer,
     not in this one.
   - **Equivalent mutant** — semantically identical, so no test can kill it
     (`x >= 0` → `x > -1`, a re-ordering with no observable effect, a default that
     is never reached). Record it in one line with the reason.
   - **False survivor** — a test *does* kill it, but the engine never ran that
     test. Suspect it whenever a whole class scores 0%, and **settle it by
     hand-mutating the line and running the suite**: if tests fail, the verdict is
     "the tool can't see it" and no test is owed. Backend gotchas carry the
     mechanism and a worked example.

   **Check [`references/known-survivors.md`](references/known-survivors.md) first.**
   Every mutant a full sweep leaves alive already has a verdict there, with the
   evidence. Triage what your *change* introduced; only re-litigate an entry if the
   code under it moved.

   Never raise a threshold or narrow the scope to make a survivor go away.

4. **Report** score, survivors, and the verdict on each, per stack. State
   killed-vs-total, not just a percentage.

## Frontend — StrykerJS

Scope (from the repo root):

```bash
{ git diff --name-only main -- frontend/app frontend/server
  git ls-files --others --exclude-standard -- frontend/app frontend/server
} | grep -E '\.(ts|vue)$' | grep -vE '\.(test|spec)\.ts$' \
  | sed 's|^frontend/||' | sort -u | paste -sd,
```

Run (in `frontend/`):

```bash
pnpm exec stryker run --mutate "app/utils/entry.ts,app/components/DaySummary.vue"
```

`pnpm test:mutation` runs the whole mutable surface — minutes, not seconds. Scope it.

### Budget (measured on this repo)

| Scope                            | Mutants | Time   |
| -------------------------------- | ------- | ------ |
| One util (`app/utils/entry.ts`)  | 8       | ~20s   |
| One component (`DaySummary.vue`) | 19      | ~19s   |
| All of `app/utils/`              | 211     | ~2m25s |

Roughly **0.7s per mutant**. `vitest.related` scopes each mutant to its related
tests (~1–5 tests, not all 473), which is what makes this affordable as a gate.

### Gotchas

- **`plugins` must be declared explicitly.** pnpm's symlinked `node_modules`
  defeats Stryker's plugin auto-discovery; without it you get "no TestRunner
  plugins were loaded".
- **`ignorePatterns: ["!.nuxt"]` is required.** Stryker hard-codes `.nuxt` (beside
  `.next` and `.svelte-kit`) in its always-ignore list, so the sandbox copy drops
  Nuxt's generated `tsconfig.app.json` and every run crashes in the dry run. It
  does **not** read `.gitignore` — `ignorePatterns` is the only project-level
  control.
- **`.vue` mutates the `<script>` block only** — templates are untouched. A
  template-only defect (a wrong class, a missing `v-if`) needs a component test.
- **`app/pages/design.vue` is excluded** — a static design reference with no
  behaviour to pin.
- A **timeout** verdict is not a survivor: it usually means an infinite loop, which
  counts as killed.
- **Stryker has no truthiness mutator.** `x == null ? a : b` scoring 100% says
  nothing about whether `x ? b : a` would be caught — and those differ for `0`,
  `''` and `NaN`. Any guard distinguishing *absent* from *zero* needs an explicit
  zero case; the score will not ask for one. (`formatEntryName` shipped a 100%
  score while the falsy form passed all 473 tests.)

## Backend — pitest

Scope (from the repo root). A Kotlin file's declarations do **not** follow its
name — `Entry.kt` holds `WeighedEntry` and `EstimatedEntry` — so the globs are
read out of the files rather than derived from their paths:

```bash
{ git diff --name-only main -- backend/src/main/kotlin
  git ls-files --others --exclude-standard -- backend/src/main/kotlin
} | grep '\.kt$' | sort -u | while read -r f; do
    pkg=$(sed -n '/^package /{s///p;q}' "$f")
    grep -hoE '^[a-z ]*(class|object|interface) [A-Za-z0-9_]+' "$f" \
      | awk -v p="$pkg" '{print p"."$NF; print p"."$NF"$*"}'
    echo "$pkg.$(basename "$f" .kt)Kt"
  done | sort -u | paste -sd,
```

Two globs per declaration, not one. `Foo` alone misses `Foo$Companion` — 44
mutants against 49 on `Nutrition` — and `Foo*` overshoots into every sibling
whose name it prefixes, so a diff touching `Goal.kt` would drag in
`GoalProgress`. `Foo` + `Foo$*` is exactly the class and its nested types. The
`…Kt` entry is the facade class Kotlin emits for a file's top-level functions;
naming one that doesn't exist is harmless.

Run (in `backend/`):

```bash
./gradlew mutationTest -PmutationTargets='com.tucker.domain.Entry,com.tucker.domain.Entry$*'
```

Bare `./gradlew mutationTest` sweeps the whole backend — minutes. Scope it. The
HTML report lands in `backend/build/reports/pitest/index.html`; the machine-readable
survivor list is `mutations.xml` beside it.

### Budget (measured on this repo)

| Scope                                         | Mutants | Time   | Per mutant |
| --------------------------------------------- | ------- | ------ | ---------- |
| One domain class (`Nutrition` + nested)        | 49      | ~35s   | 0.4s       |
| One feature's classes (Check: domain+api+svc)  | 29      | ~35s   | 0.8s       |
| All of `com.tucker.domain.*`                   | 414     | ~5m50s | 0.8s       |
| All of `com.tucker.api.*`                      | 226     | ~6m10s | 1.6s       |
| The whole backend                              | 1043    | ~17m   | 1.0s       |

**~13s of every run is fixed** — pitest runs the whole suite once for coverage
before it makes a single mutant, so nothing brings a small scope below ~35s and
there is nothing to tune. Past that, cost tracks *what covers the class*, not how
many mutants there are: `api/` has fewer mutants than `domain/` and takes longer,
because each one re-runs `@SpringBootTest` tests. Budget ~0.8s per mutant for
domain code and **~1.6s for anything a controller test covers**.

### Gotchas

- **The Kotlin noise filters live in `build.gradle.kts` — don't remove them.**
  pitest ships its own Kotlin junk filter (feature `FKOTLIN`, on by default), which
  is why the noise floor is low; the *better* filter — arcmutate's, covering
  coroutines and inline functions — is commercial, and the old open-source
  `pitest-kotlin` plugin was archived in 2023. Two gaps are closed by hand:
  `*$$inlined$*` (the classes the compiler emits for an inlined lambda — the
  comparator behind `sortedBy`, for one) and calls to
  `kotlin.jvm.internal.Intrinsics` (the null assertion on every platform-type
  access). `--avoidCallsTo` **replaces** pitest's default list rather than adding
  to it, so the four logging frameworks it ships with are restated alongside
  `Intrinsics`; drop them and every deleted `log.warn(…)` comes back as a survivor
  no test should be asked to kill.
- **Generated code is excluded structurally, not by name.** jOOQ generates Java and
  everything hand-written is Kotlin, so `--mutableCodePaths` names only the Kotlin
  output directory. Don't "simplify" that back to all of `classesDirs` — it silently
  re-admits ~40 generated schema classes.
- **`--threads 1` is pitest's default, restated on purpose.** Raising it is the
  obvious way to speed a sweep up, and it corrupts the result: every test shares one
  SQLite file, so parallel minions contend for it and report mutants killed by lock
  timeouts rather than by assertions.
- **A `ConditionalsBoundaryMutator` survivor inside an `init` block is usually a
  real gap, not noise.** It is a `require(x > 0)` relaxed to `>= 0` — the invariant
  holds, but no test constructs the value exactly at the boundary.
- **Spring code that runs at context startup produces false survivors — verify
  one by hand before believing it.** pitest picks which tests to re-run from *line*
  coverage, and a `@Bean` factory method executes once, when the first test class
  builds the context. Every later test class reuses the cached context without
  re-running that line, so pitest attributes the bean to whichever test happened to
  be first and never runs the tests that actually observe it. `AccessSecurityConfig`
  scores **0/22** for this reason: the tests pitest selects for the filter chain are
  `OwnerEmailPlaceholderTest` and `ReminderSchedulerIntegrationTest`, while
  `AccessGateTest` — the one test that asserts the gate — is not among them.
  Deleting `authorize(anyRequest, authenticated)` by hand fails **142 tests**.
  Anything else built once and then reused hits the same wall — the
  `@ConfigurationProperties` accessors, and `KotlinNullableModelConverter`, which
  scores **0/23** while hand-deleting its `nullable = true` fails 4 tests.
  Hand-mutate before writing a test for one of these: the verdict is "the tool
  can't see it", not "the tests don't". (Class names and counts here are a worked
  example, not a spec — which test builds the context first is emergent, so
  re-derive rather than trusting these numbers.)
- **The caching wall is not only Spring's, and not only configuration's.** springdoc
  caches the built OpenAPI spec, so every mutant in a `ModelConverter` is invisible to
  a test that reads `/v3/api-docs` — and the same reaches ordinary domain code: the
  `@JsonValue` accessor on `DayStatus`, `PaceStatus` and `DriftStatus` reports
  NO_COVERAGE while blanking one by hand fails four tests. Suspect *anything*
  read only during serialization or context startup, whatever it looks like.
  Where the class holds real logic, the fix is to specify it directly — a test that
  drives it without Spring makes it killable for real, which is what
  `KotlinNullableModelConverterTest` and `AccessAssertionValidatorTest` do (0/23 → 20/23
  and 3 survivors → none).
- **Excluding a class is a last resort, and only when nothing in it is visible.**
  `--excludedClasses` currently drops three (`AccessSecurityConfig`, `AccessProperties`,
  `TuckerApplicationKt`), each verified by hand-mutation and each 100% unkilled before
  exclusion. A class where *some* mutants die stays in: hiding its 3 survivors would
  hide its 11 working ones too.
- **pitest never mutates a constant.** Its default mutator set has no
  `INLINE_CONSTS`, so `SMOOTHING`, `OBSERVED_WINDOW_DAYS` and the Atwater factors
  are invisible to it: 100% on `Nutrition` says nothing about whether a test would
  notice `9` becoming `8`. A tuning constant needs an explicit test asserting the
  number it produces; the score will not ask for one. (This is pitest's version of
  Stryker's missing truthiness mutator — same lesson, different blind spot.)

## Delegating triage

With more than ~3 survivors, spawn a subagent (`Agent`, general-purpose,
explicitly **read-only**) to classify them and return only the verdicts. The
report is bulky, the conclusion is small, and the classification is judgement
work. Write the tests yourself afterwards — don't let the agent edit the tree.

## Related

`tdd` (writing the missing test) · `feature-sign-off` (runs this as gate 3) ·
`frontend-dev` · `backend-dev` · `component-testing-best-practices` ·
ADR 0013 (test coverage policy).
