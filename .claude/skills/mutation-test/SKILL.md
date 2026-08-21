---
name: mutation-test
description: Runs StrykerJS mutation testing over Tucker's Vitest suite, scoped to the source files a change touched, then triages every surviving mutant as a real test gap or an equivalent mutant. Use as gate 3 of feature-sign-off, or when the user asks to mutation-test a change, run Stryker, measure a mutation score, or check whether the tests would actually catch a bug.
---

# Mutation test (Tucker)

Coverage says a line ran. Mutation testing asks whether any test would have
**noticed it change**. Stryker rewrites the source one mutant at a time and
re-runs the related tests; a mutant that survives is a line no assertion pins.

**Vitest layer only.** Playwright is out of scope — mutating source to re-run
browser suites is far too slow. Gaps there (unanchored aria-snapshot regexes,
substring `getByText`, fixture defaults that can't occur in production) are still
found by hand.

## Quick start

Run in `frontend/`:

```bash
pnpm exec stryker run --mutate "app/utils/entry.ts,app/components/DaySummary.vue"
```

`pnpm test:mutation` runs the whole mutable surface — minutes, not seconds. Scope
it.

## Workflow

1. **Scope from the diff.** Mutating untouched files reports old debt as if this
   change caused it.

   From the **repo root** (the paths are repo-relative; running it in
   `frontend/` looks for `frontend/frontend/` and returns nothing):

   ```bash
   { git diff --name-only main -- frontend/app frontend/server
     git ls-files --others --exclude-standard -- frontend/app frontend/server
   } | grep -E '\.(ts|vue)$' | grep -vE '\.(test|spec)\.ts$' \
     | sed 's|^frontend/||' | sort -u | paste -sd,
   ```

   Diff against `main` **without** `...`, plus untracked files: sign-off usually
   runs before the commit, so a three-dot range against `HEAD` reports nothing
   and the gate silently passes having mutated zero files.

   Empty list → the change touched no mutable source. Report **SKIP** and stop.

2. **Run** `pnpm exec stryker run --mutate "<list>"` from `frontend/`.

3. **Triage every survivor.** A score is not the deliverable — the verdict per
   survivor is. Each is exactly one of:
   - **Real gap** — the mutant changes behaviour a user could observe, in a
     module that owes its own test (a deep module, per ADR 0013). Write the
     missing test red-green (per `tdd`): confirm it fails against the mutant's
     behaviour before restoring the source, which is already correct.
   - **Killed by an out-of-scope layer** — the module is *thin glue*, whose red
     lives in a Playwright e2e or the real-stack smoke by ADR 0013 ("thin glue
     gets no separate test"). Stryker can't see those layers, so these survive by
     construction. **Name the spec that kills it** and move on — writing a
     standalone Vitest test for glue would break the coverage policy, not honour
     it. If no spec kills it, it is a Real gap in the smoke, not in Vitest.
   - **Equivalent mutant** — semantically identical, so no test can kill it
     (`x >= 0` → `x > -1`, a re-ordering with no observable effect, a default
     that is never reached). Record it in one line with the reason.

   Never raise a threshold or narrow the scope to make a survivor go away.

4. **Report** score, survivors, and the verdict on each. State killed-vs-total,
   not just a percentage.

## Budget (measured on this repo)

| Scope                             | Mutants | Time      |
| --------------------------------- | ------- | --------- |
| One util (`app/utils/entry.ts`)   | 8       | ~20s      |
| One component (`DaySummary.vue`)  | 19      | ~19s      |
| All of `app/utils/`               | 211     | ~2m25s    |

Roughly **0.7s per mutant**. A typical feature's changed files land well under a
minute, which is what makes this affordable as a gate. `vitest.related` scopes
each mutant to its related tests (~1–5 tests per mutant, not all 473).

## Delegating triage

With more than ~3 survivors, spawn a subagent (`Agent`, general-purpose,
explicitly **read-only**) to classify them and return only the verdicts. The
report is bulky, the conclusion is small, and the classification is judgement
work. Write the tests yourself afterwards — don't let the agent edit the tree.

## Gotchas

- **`plugins` must be declared explicitly.** pnpm's symlinked `node_modules`
  defeats Stryker's plugin auto-discovery; without it you get "no TestRunner
  plugins were loaded".
- **`ignorePatterns: ["!.nuxt"]` is required.** Stryker hard-codes `.nuxt`
  (beside `.next` and `.svelte-kit`) in its always-ignore list, so the sandbox
  copy drops Nuxt's generated `tsconfig.app.json` and every run crashes in the
  dry run. Note it does **not** read `.gitignore` — `ignorePatterns` is the only
  project-level control, so adding a build directory to `.gitignore` will not
  keep it out of the sandbox.
- **`.vue` mutates the `<script>` block only** — templates are untouched. A
  template-only defect (a wrong class, a missing `v-if`) is invisible here and
  needs a component test.
- **`app/pages/design.vue` is excluded** — it is a static design reference with
  no behaviour to pin.
- A **timeout** verdict is not a survivor: it usually means the mutant caused an
  infinite loop, which counts as killed.
- **100% is not "fully tested" — Stryker only makes the mutants it knows how to
  make.** It has no operator that rewrites a null check as a truthiness check, so
  `x == null ? a : b` scoring 100% says nothing about whether `x ? b : a` would
  be caught — and those differ for `0`, `''` and `NaN`. Any guard distinguishing
  *absent* from *zero* needs an explicit zero case; the score will not ask for
  one. (`formatEntryName` shipped a 100% score while the falsy form passed all
  473 tests.)

## Related

`tdd` (writing the missing test) · `feature-sign-off` (runs this as gate 3) ·
`component-testing-best-practices` · ADR 0013 (test coverage policy).
