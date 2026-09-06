---
name: feature-sign-off
description: The pre-commit/push sign-off gate for a finished feature or fix on the Tucker repo. Runs six quality gates in order — /verify twice (a cheap reachability pass first, the full two-viewport walk-through last, on the code that ships), with /simplify (apply cleanups), /mutation-test (do the tests actually catch bugs), /code-review (hunt correctness bugs) and /check-adrs (honour recorded decisions) in between — fixing what each surfaces before moving on, and only then commits and pushes. Use when a change is functionally complete and the user says "sign off", "ready to commit/push", "wrap up this feature", "run the gates", or before opening a PR.
---

# Feature sign-off

The gate a change passes through once it's functionally complete, *before* it's
committed and pushed. It bundles the six checks this repo relies on into one
ordered pass so nothing ships unverified, untested, unreviewed, or out of step
with the project's recorded decisions. Each gate is a real skill — this skill is
the conductor that runs them in the right order and acts on what they find.

Run it from a clean-enough working tree where the feature's behaviour is done.
It does **not** replace TDD during the build; it's the final sweep after.

## The six gates, in order

Run them in this sequence — the order is deliberate. Address what each surfaces
*before* starting the next.

**`/verify` runs twice, and that is the whole shape of this list.** Gates 1 and 3
change behaviour as a matter of course, so a single up-front walk-through is stale
by the time the code is final — measured, not feared: in the run this order was
written from, `/simplify` changed an error state and `/code-review` changed the
feature's own matching rule, and the walk-through had to be redone anyway. So the
cheap half runs first, to stop the expensive gates being spent on a surface that
does not load, and the real one runs last, on the code that ships.

0. **`/verify` (reachability) — does it run at all?** One viewport, the golden
   path, no probes. Two minutes. A FAIL or BLOCKED here stops the sign-off before
   an agent is spawned — fix it and re-run this pass.

1. **`/simplify` — clean it up.** Apply reuse / simplification / efficiency /
   altitude cleanups to the changed code. It *edits* the working tree, so run it
   before the bug hunt — the reviewer then reads the code you're actually
   shipping, not a draft. Re-run the relevant tests after it applies fixes.

   It fans out to **three** review agents in parallel — reuse+simplification (one
   agent, one angle), efficiency, and altitude. Not four: reuse and simplification
   independently report the same findings — measured at 3 of 3 shared in one run —
   and the duplicate costs an agent on the gate's critical path.

   **Sweep the doc comments in the same pass.** Every JSDoc/KDoc the diff adds or
   touches must be brief, present-tense, and non-obvious: it says what the thing
   *is* and any rule a reader would get wrong, and nothing the signature already
   says. Delete changelog prose ("used to…", "previously…", "changed so…"),
   issue/PR numbers, and narration of the bug that prompted the code — git
   history and ADRs hold the why-it-changed. Rationale longer than a sentence or
   two belongs in an ADR the comment links.

2. **`/mutation-test` — do the tests actually catch bugs?** Run the engine for
   **each stack the diff touches** — StrykerJS over Vitest in `frontend/`, pitest
   over the fast JUnit suite in `backend/` — **scoped to the source this change
   touched**, and give every surviving mutant one of that skill's four verdicts —
   a real gap (write the missing test), a kill by an out-of-scope layer (name the
   spec), an equivalent mutant (record why), or a false survivor the engine never
   ran a test against (settle it by hand-mutating). It runs here, not later, for
   two reasons: the code is final after gate 1, and it *adds tests* that gate 3
   must then review. The browser and
   container layers are out of scope in both, so keep checking those by hand (an
   unanchored aria-snapshot regex and a substring `getByText` both pass a change
   they should have caught). Budget roughly a minute for a frontend scope and a
   few for a backend one. SKIP the stack with a note if the diff touches no
   mutable source there (docs, config, tests only).

3. **`/code-review medium` — hunt correctness bugs.** Review the (now-simplified)
   diff for real bugs. **Run it at `medium` effort**, not the default high: at
   medium, `/code-review` focuses on its correctness angles and drops the reuse /
   simplification / efficiency / altitude angles — which `/simplify` just ran and
   applied in gate 1. Running it high here would re-do that cleanup pass for no
   gain. Medium gives cleanup-once (gate 1) + correctness-once (gate 3) with no
   overlap. Triage every finding: fix the genuine ones, and for each you *don't*
   fix, say why (by-design per an ADR, pre-existing, out of scope). Don't let an
   unexplained finding through. (Bump to high only if the diff is large or
   security-sensitive and you want the broader net despite the redundancy.)

4. **`/check-adrs` — honour the recorded decisions.** Verify the diff against the
   ADRs in `docs/adr/` and the ubiquitous language in `CONTEXT.md`. A FAIL is
   either a code fix or a same-PR doc fix (per `[[prefer-source-fix-over-adr]]`)
   — the user's call, surfaced. It runs after the code gates so it judges the
   final code.

5. **`/verify` (the walk-through) — does the shipping code actually work?** Both
   viewports, the golden path, and the **input probes** the skill now names — the
   values a real user's data comes in, at their boundaries, not just the empty and
   error states. This is CLAUDE.md's PR walk-through gate and it is the last thing
   before the commit, so nothing changes under it. A FAIL sends you back to
   whichever gate owns the fix, and then back here.

## After the gates

Only once all six are green (or every non-green item is fixed or explicitly
justified):

1. Run the fast suites once more if any gate changed code — backend
   `./gradlew detekt build`, frontend `pnpm lint && pnpm test` — so the commit is
   green.

   **Between gates, run the touched spec, not the suite.** `pnpm test --run
   <file>` and `pnpm test:e2e <spec>` after each gate's fixes; the **full**
   frontend e2e and the smokes once, here, before the commit. The full mocked e2e
   is ~2 minutes and CI re-runs all of it on the PR, so running it after every
   gate spends ~6 minutes proving something twice.
2. **Commit and push** on the feature branch (never straight to `main`; see
   `[[always-work-on-a-feature-branch]]` and `[[push-after-committing]]`). Group
   commits by concern; end messages with the `Co-Authored-By` trailer.
3. Open the PR if the user wants one. CI re-runs the automated suites; the PR
   body should note the sign-off gates that passed.

## Reporting

Emit a short sign-off summary the user (and PR reviewer) can replay:

```
## Feature sign-off — <feature/issue>

0. /verify (reach) ✅ /goal loads and the form submits at 1468px
1. /simplify       ✅ applied 1 cleanup (consolidated kg formatter)
2. /mutation-test  ⚠️ 27/29 killed on 2 files → 1 gap closed (new test), 1 equivalent
3. /code-review md ⚠️ 2 findings → both fixed (double-render, banner copy); 4 by-design
4. /check-adrs     ⚠️ 1 FAIL → fixed CONTEXT.md (stale auto-deactivate wording)
5. /verify (walk)  ✅ desktop + phone; probes: 0 kg ✅ · 300 kg ✅ · goal already reached ✅

Suites green (detekt/build, lint/test). Committed + pushed to <branch>.
```

## Notes

- **Order is load-bearing.** Reachability first (don't review code that doesn't
  run), simplify before mutation-test (mutate the shipping code, not a draft),
  mutation-test before review (its new tests are part of what gets reviewed),
  check-adrs after the code gates (judge the final diff), and the full
  walk-through last so nothing changes under it. Don't reorder for convenience.
- **A gate that finds the most and runs late is not a scheduling accident.**
  `/code-review` found this list's two worst defects — both user-facing, both past
  759 tests and a 100% mutation score — and it runs fourth by design: it reads the
  simplified code and the tests gate 2 added (mutation-test). What that says is not "move it", it
  is that the gates before it must stop handing it the same class of bug. Gate 0/5's
  input probes and `mutation-test`'s recorded blind spots are how.
- **A green mutation score is not a green test suite.** `/mutation-test` reaches
  the Vitest and fast-JUnit layers only. Fixture defaults that production can't
  produce, unanchored aria-snapshot regexes, and substring `getByText` matchers
  all sail through it — as does a wrong tuning constant, which pitest's operators
  never touch. Check those by hand while reviewing the diff's tests.
- **`/simplify` + `/code-review medium` are complementary, not redundant.**
  `/simplify` owns cleanup and *applies* it; `/code-review` at medium owns the
  correctness hunt and *reports* it. The overlap only appears if you run
  `/code-review` high (it re-adds the cleanup angles). Keep gate 3 at medium so
  each kind of work happens exactly once.
- **Don't rubber-stamp.** A gate that found nothing is a result worth stating;
  a gate skipped is a gap. If you skip one (e.g. `/verify` SKIP for a docs-only
  change), say which and why.
- **Fix-or-justify is the bar.** Every finding is either fixed or has a one-line
  reason it isn't. An unaddressed finding means the sign-off isn't done.
- This skill assumes the work is built and tested. It is the *exit* gate, not a
  substitute for red-green TDD during development.
