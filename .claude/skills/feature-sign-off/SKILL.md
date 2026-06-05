---
name: feature-sign-off
description: The pre-commit/push sign-off gate for a finished feature or fix on the Tucker repo. Runs four quality gates in order — /verify (runtime behaviour), /simplify (apply cleanups), /code-review (hunt correctness bugs), /check-adrs (honour recorded decisions) — fixing what each surfaces before moving on, and only then commits and pushes. Use when a change is functionally complete and the user says "sign off", "ready to commit/push", "wrap up this feature", "run the gates", or before opening a PR.
---

# Feature sign-off

The gate a change passes through once it's functionally complete, *before* it's
committed and pushed. It bundles the four checks this repo relies on into one
ordered pass so nothing ships unverified, unreviewed, or out of step with the
project's recorded decisions. Each gate is a real skill — this skill is the
conductor that runs them in the right order and acts on what they find.

Run it from a clean-enough working tree where the feature's behaviour is done.
It does **not** replace TDD during the build; it's the final sweep after.

## The four gates, in order

Run them in this sequence — the order is deliberate. Address what each surfaces
*before* starting the next. If a later gate's fix changes behaviour, loop back
to the affected earlier gate (re-verify after a code-review fix that touches a
code path).

1. **`/verify` — does it actually work?** Drive the running app to where the
   change executes and observe it, at **both phone and desktop viewports**
   (CLAUDE.md's responsive split). This is runtime evidence, not tests. A FAIL
   or BLOCKED here stops the sign-off — fix the behaviour and re-verify before
   continuing. (If the WM clamps the browser so a viewport can't be forced, fall
   back to a Playwright Pixel-7 capture and say so.)

2. **`/simplify` — clean it up.** Apply reuse / simplification / efficiency /
   altitude cleanups to the changed code. It *edits* the working tree, so run it
   before the bug hunt — the reviewer then reads the code you're actually
   shipping, not a draft. Re-run the relevant tests after it applies fixes.

3. **`/code-review` — hunt correctness bugs.** Review the (now-simplified) diff
   for real bugs. Triage every finding: fix the genuine ones, and for each you
   *don't* fix, say why (by-design per an ADR, pre-existing, out of scope). Don't
   let an unexplained finding through.

4. **`/check-adrs` — honour the recorded decisions.** Verify the diff against the
   ADRs in `docs/adr/` and the ubiquitous language in `CONTEXT.md`. A FAIL is
   either a code fix or a same-PR doc fix (per `[[prefer-source-fix-over-adr]]`)
   — the user's call, surfaced. This runs last so it judges the final code.

## After the gates

Only once all four are green (or every non-green item is fixed or explicitly
justified):

1. Run the fast suites once more if any gate changed code — backend
   `./gradlew detekt build`, frontend `pnpm lint && pnpm test` — so the commit is
   green.
2. **Commit and push** on the feature branch (never straight to `main`; see
   `[[always-work-on-a-feature-branch]]` and `[[push-after-committing]]`). Group
   commits by concern; end messages with the `Co-Authored-By` trailer.
3. Open the PR if the user wants one. CI re-runs the automated suites; the PR
   body should note the sign-off gates that passed.

## Reporting

Emit a short sign-off summary the user (and PR reviewer) can replay:

```
## Feature sign-off — <feature/issue>

1. /verify     ✅ PASS — desktop walk-through + Pixel-7 capture (phone WM-clamped)
2. /simplify   ✅ applied 1 cleanup (consolidated kg formatter)
3. /code-review ⚠️ 2 findings → both fixed (double-render, banner copy); 4 by-design
4. /check-adrs ⚠️ 1 FAIL → fixed CONTEXT.md (stale auto-deactivate wording)

Suites green (detekt/build, lint/test). Committed + pushed to <branch>.
```

## Notes

- **Order is load-bearing.** verify first (don't review code that doesn't run),
  simplify before review (review the shipping code), check-adrs last (judge the
  final diff). Don't reorder for convenience.
- **Don't rubber-stamp.** A gate that found nothing is a result worth stating;
  a gate skipped is a gap. If you skip one (e.g. `/verify` SKIP for a docs-only
  change), say which and why.
- **Fix-or-justify is the bar.** Every finding is either fixed or has a one-line
  reason it isn't. An unaddressed finding means the sign-off isn't done.
- This skill assumes the work is built and tested. It is the *exit* gate, not a
  substitute for red-green TDD during development.
