---
name: check-adrs
description: Pre-PR gate that verifies a code change against Tucker's recorded decisions — the ADRs in docs/adr/ and the ubiquitous language in CONTEXT.md. Discovers which decisions the diff touches, extracts each normative constraint (decision, rejected alternative, MUST/MUST NOT, out-of-scope ruling, boundary rule, domain term), and emits a per-constraint pass/fail/uncertain verdict citing both the doc line and the code. Use before opening a PR, when finishing a domain-related feature, or when the user asks to check a change against the ADRs / CONTEXT.md / design decisions. Runs alongside /verify (runtime behaviour) and /code-review (correctness).
---

# Check against recorded decisions

Tucker records its design in `docs/adr/*.md` (architecture + domain decisions) and
`CONTEXT.md` (the ubiquitous language). This skill is the **third pre-PR gate**:
`/verify` checks runtime behaviour, `/code-review` checks correctness, and this
checks that the implementation actually honours the decisions the project already
made. It catches drift the other gates miss — an out-of-scope line crossed, a
rejected alternative quietly reintroduced, a boundary ruling violated, a domain
term the code spells differently than CONTEXT.md.

This is a **read-and-judge** gate. It does not change code; it produces a verdict.
If a constraint genuinely no longer fits, the fix is to update the ADR/CONTEXT.md
in the same PR (see `[[prefer-source-fix-over-adr]]`), not to ignore it — but that
is the user's call, surfaced as a finding.

## Workflow

1. **Get the diff.** `git diff main...HEAD` (or the diff the user names). List the
   changed files and the feature/issue under review.

2. **Map the diff to decisions.** Read `docs/adr/` filenames (they're descriptive)
   and the CONTEXT.md term list. Select every ADR and CONTEXT.md section the change
   plausibly touches — by subsystem, by domain term appearing in the diff, by the
   feature's own ADR (a feature usually names its ADR in CLAUDE.md / the issue).
   When in doubt, include it. Note which you ruled out and why.

3. **Extract constraints.** From each selected doc, pull every *normative* statement
   as a discrete, checkable constraint. Quote the source line(s). The kinds:

   | Kind | Looks like |
   | --- | --- |
   | **Decision** | "chosen", "we will", "the rule is", a stated invariant |
   | **Rejected alternative** | "Rejected:", "we considered X and didn't" — must NOT reappear |
   | **MUST / MUST NOT** | hard requirements, "never", "always", "exactly two" |
   | **Out-of-scope** | "out of scope", "deferred", "do not build" — must be ABSENT |
   | **Boundary ruling** | edge-case decisions ("Boundary rulings" sections, "iff", "before/after") |
   | **Domain term** | a CONTEXT.md term — code names/comments must match it exactly |

4. **Check each constraint against the diff.** For every constraint, find the code
   that satisfies or violates it. A constraint with no corresponding code in a diff
   that should implement it is itself a finding (likely a gap). Assign a verdict:

   - **PASS** — code clearly honours it; cite the file:line that does.
   - **FAIL** — code contradicts it (rejected alternative present, out-of-scope
     built, invariant broken, term misspelled); cite the offending file:line.
   - **UNCERTAIN** — relevant but you can't confirm from the diff alone (logic not
     in this diff, needs a test run, ambiguous); say what would resolve it.

   Prefer reading the actual code over assuming. For non-trivial diffs, delegate
   per-ADR checks to parallel `Explore`/`general-purpose` subagents (one ADR each)
   and collate — keeps each check focused and the citations honest.

5. **Report** in the format below. Lead with FAILs, then UNCERTAINs, then a PASS
   summary. Every non-PASS line must cite **both** the doc constraint and the code
   location, so the reviewer can replay it.

## Report format

```
## ADR / CONTEXT check — <feature/issue>

Decisions reviewed: 0008, 0002, CONTEXT.md(Goal, Maintenance Mode, Drift Status)
Ruled out: 0003 (no forms changed), 0006 (no nutrition lookup)

### ❌ FAIL (N)
- **[ADR 0008] Reaching latches — never unset while active.** `reachedOn` is
  cleared in WeightController.kt:74 when trend rises back above target.
  → ADR line 71: "set once and never unset while the Goal is active".

### ⚠️ UNCERTAIN (N)
- **[ADR 0008] Switch overwrites today's review.** DELETE calls
  deactivateActiveGoal (GoalService.kt:62) but I can't confirm from the diff that
  it overwrites vs no-ops. Resolve: run GoalServiceTest or read recomputeFor.

### ✅ PASS (N)
- [ADR 0008] No silent auto-switch — transition only via the two banner actions
  (today.vue:88). [CONTEXT] "reached" term used verbatim in GoalResponse.kt:21.
```

## Notes

- **Cite, don't paraphrase the verdict.** A FAIL the reviewer can't trace to a doc
  line and a code line is noise. Quote the ADR; point at the file:line.
- **Scope = the diff.** Don't audit the whole codebase against every ADR; check
  what *this change* touches. Pre-existing violations outside the diff are at most
  an UNCERTAIN footnote, not a FAIL.
- **Out-of-scope is checked by absence.** For "deferred"/"do not build" rulings,
  the PASS is *not finding* that code; a FAIL is finding it shipped anyway.
- **Domain terms are exact.** CONTEXT.md is the ubiquitous language — `Trend
  Weight`, `Calorie Budget`, `reached`, `Drift Status`. Code that invents a synonym
  is a FAIL even if it works.
- A clean run is all PASS/UNCERTAIN with zero FAIL. Surface UNCERTAINs plainly —
  don't inflate them to PASS to get a green board.
