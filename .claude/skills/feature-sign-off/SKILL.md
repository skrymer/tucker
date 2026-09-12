---
name: feature-sign-off
description: The pre-commit/push sign-off gate for a finished feature or fix on the Tucker repo. Runs seven quality gates in order — /verify twice (a cheap reachability pass first, the full two-viewport walk-through last, on the code that ships), with /simplify (apply cleanups), /mutation-test (do the tests actually catch bugs), /code-review (hunt correctness bugs), /check-adrs (honour recorded decisions) and a resolutions pass (nothing approves its own fix) in between — fixing what each surfaces before moving on, and only then commits and pushes. Use when a change is functionally complete and the user says "sign off", "ready to commit/push", "wrap up this feature", "run the gates", or before opening a PR.
---

# Feature sign-off

The gate a change passes through once it's functionally complete, *before* it's
committed and pushed. It bundles the seven checks this repo relies on into one
ordered pass so nothing ships unverified, untested, unreviewed, or out of step
with the project's recorded decisions. Each gate is a real skill — this skill is
the conductor that runs them in the right order and acts on what they find.

Run it from a clean-enough working tree where the feature's behaviour is done.
It does **not** replace TDD during the build; it's the final sweep after.

## The seven gates, in order

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
   — the user's call, surfaced.

   **Launch it in the same message as gate 3.** Both are pure read-and-report —
   neither edits the tree, and you apply both sets of findings afterwards — so
   running them back to back spends the shorter one's wall-clock for nothing
   (4–7 min against code-review's 12 in the run this was measured on). The cost
   is that it judges pre-fix code: when code-review's fixes land, re-check **only
   the files they touched** against the constraints `/check-adrs` cited, which is
   a read of a handful of lines rather than a second run.

   Gate 2 does **not** join them. It writes tests, and gate 3's test-quality pass
   reviews them — in the measured run it caught a vacuous assertion in a test
   gate 2 had just added. Overlapping those two hides exactly that.

5. **The resolutions pass — does anything approve its own fix?** Gates 1, 3 and 4
   put the *finding* in a fresh context. What each finding then **means** is
   decided here — which are real, which the fix addresses, which are dismissed and
   on what grounds — and nothing reads that. So the code that ships carries the
   least-reviewed changes in the whole diff, the fixes, written last and under the
   most time pressure; and a set of dismissals whose only reader wrote them.

   Hand a **fresh agent** the findings from gates 1–4 with the resolution recorded
   against each, the current diff, and the same context pack the other agents got.
   It answers two questions and nothing else:

   - **Does each fix address the finding it cites, without introducing something
     new?** A plausible-but-wrong fix is the failure mode here, and it lands at
     exactly the moment nobody is still looking.
   - **Does each dismissal hold?** "By design per ADR 00xx", "pre-existing", "out
     of scope" are checkable claims, and the agent has the ADRs to check them
     against.

   It reports; it does not edit. A rejected fix or dismissal goes back to the gate
   that owns it, and that gate's re-run is what closes it — not a second opinion
   from here.

   **It is not a second `/code-review`.** It hunts nothing: given a finding and a
   resolution it judges that one pair, which is a far narrower question than gate
   3's and costs accordingly. If gates 1–4 produced no findings at all, SKIP it
   and say so — there is nothing to adjudicate.

6. **`/verify` (the walk-through) — does the shipping code actually work?** Both
   viewports, the golden path, and the **input probes** the skill now names — the
   values a real user's data comes in, at their boundaries, not just the empty and
   error states. This is CLAUDE.md's PR walk-through gate and it is the last thing
   before the commit, so nothing changes under it. A FAIL sends you back to
   whichever gate owns the fix, and then back here.

## Spending the agents well

Gates 1, 3, 4 and 5 fan out to subagents, and they are the sign-off's critical path —
everything else is minutes, they are tens of minutes. Two things cut that without
losing a finding:

- **Hand each agent a context pack, not just the diff.** Every agent otherwise
  re-discovers the same files: in the measured run, eight agents each independently
  read `log.vue`, `catalog.ts` and the ADRs, at ~15–35 tool calls apiece. Write the
  diff to a scratch file *and* inline the three-to-five files the angle actually
  needs, then say which further reading is expected. Naming the files it will need
  is also what stops it wandering.
- **Batch the fixes, not one test run each.** Findings arrive in groups and most are
  independent. Apply a whole gate's worth, then run the touched spec once. The
  exception is a fix you intend to prove by hand-mutation — those stay one at a
  time, because the point is watching that single mutant die.

## After the gates

Only once all seven are green (or every non-green item is fixed or explicitly
justified):

1. Run the fast suites once more if any gate changed code — backend
   `./gradlew detekt build`, frontend `pnpm lint && pnpm test` — so the commit is
   green.

   **Between gates, run the touched spec, not the suite.** `pnpm test --run
   <file>` and `pnpm test:e2e <spec>` after each gate's fixes; the **full**
   frontend e2e and the smokes once, here, before the commit. The full mocked e2e
   is ~2 minutes and CI re-runs all of it on the PR, so running it after every
   gate spends ~6 minutes proving something twice.

   **`docker compose build backend` only when the diff touched the backend.**
   `pnpm test:smoke` force-recreates the container from the existing image and
   resets the DB per test (issue #70), so a frontend-only slice needs no rebuild —
   and building one costs a minute to produce a byte-identical image.
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
5. resolutions     ⚠️ 7 judged → 6 upheld; 1 dismissal rejected ("pre-existing" — the diff moved that line) → fixed
6. /verify (walk)  ✅ desktop + phone; probes: 0 kg ✅ · 300 kg ✅ · goal already reached ✅

Suites green (detekt/build, lint/test). Committed + pushed to <branch>.
```

## Notes

- **Order is load-bearing, and the two overlaps are not.** Reachability first
  (don't review code that doesn't run), simplify before mutation-test (mutate the
  shipping code, not a draft), mutation-test before review (its new tests are part
  of what gets reviewed), and the full walk-through last so nothing changes under
  it. Don't reorder those for convenience. `/check-adrs` is the one that may run
  *alongside* review rather than after it, because it edits nothing — that is a
  concurrency, not a reorder, and the re-check on review's changed files is what
  pays for it.
- **A gate that finds the most and runs late is not a scheduling accident.**
  `/code-review` found this list's two worst defects — both user-facing, both past
  759 tests and a 100% mutation score — and it runs fourth by design: it reads the
  simplified code and the tests gate 2 added (mutation-test). What that says is not "move it", it
  is that the gates before it must stop handing it the same class of bug. Gate 0/6's
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
- **Nothing approves its own fix.** Gates 1, 3 and 4 already put the *finding* in
  a fresh context; gate 5 does the same for the *resolution*, the half this
  context still settled alone. Its position is as load-bearing as its presence:
  after every fix has landed, and before the walk-through, so gate 6 is the last
  word on code some reviewer has actually read. Borrowed from oh-my-claudecode's
  rule that an approval pass may not run in the context that authored the work.
- **Don't rubber-stamp.** A gate that found nothing is a result worth stating;
  a gate skipped is a gap. If you skip one (e.g. `/verify` SKIP for a docs-only
  change), say which and why.
- **Fix-or-justify is the bar.** Every finding is either fixed or has a one-line
  reason it isn't. An unaddressed finding means the sign-off isn't done.
- This skill assumes the work is built and tested. It is the *exit* gate, not a
  substitute for red-green TDD during development.
