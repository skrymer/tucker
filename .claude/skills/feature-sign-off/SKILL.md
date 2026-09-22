---
name: feature-sign-off
description: The pre-commit/push sign-off gate for a finished feature or fix on the Tucker repo. Runs seven quality gates in order — /verify twice (a cheap reachability pass first, the full two-viewport walk-through last, on the code that ships), with /simplify (apply cleanups), /mutation-test (do the tests actually catch bugs), /code-review (hunt correctness bugs), /check-adrs (honour recorded decisions) and a resolutions pass (nothing approves its own fix) in between — fixing what each surfaces before moving on, and only then commits and pushes. Every agent is briefed to a neutrality contract, one argues against merging, one ledgers the diff against the issue's own acceptance criteria, and a split between two agents is settled blind rather than by the author. Use when a change is functionally complete and the user says "sign off", "ready to commit/push", "wrap up this feature", "run the gates", or before opening a PR.
---

# Feature sign-off

The gate a change passes through once it's functionally complete, *before* it's
committed and pushed. It bundles the seven checks this repo relies on into one
ordered pass so nothing ships unverified, untested, unreviewed, short of what the
issue asked for, or out of step with the project's recorded decisions. Each gate is
a real skill — this skill is the conductor that runs them in the right order and
acts on what they find.

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

**Record every agent's `output_file` path as you spawn it.** Gate 5 reads those
transcripts, and a path not written down when the agent ran is a directory hunt
later — so this one instruction has to be obeyed several gates before the gate that
needs it.

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
   mutable source there (docs, config, tests only); that skill's step 1 owns the
   base, the command and the SKIP-vs-STOP rule.

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

   **Launch the adversary (Brief A) in this same message.** `/code-review` runs
   inline, so the adversary is a background agent alongside it and gate 4. See
   *Keeping the fan-out independent* below for what it is and why it is not a
   fourth reviewer.

   **Launch the acceptance ledger (Brief D) in this same message too.** It reads the
   same issue the adversary does and asks the one question the adversary's angles do
   not: not whether the change should exist, nor whether it is too much, but whether
   it is enough. It emits one row per acceptance criterion, then once, at the end,
   behaviour in the diff that no criterion asked for — and nothing else. See
   *Nothing else asks whether it is finished* in the notes for why no other gate
   asks this; Brief D in the reference for the rows it emits, what pins each, and
   why it is not a fifth reviewer.

   Two of its outcomes need handling here. An **UNSOUND** row — the criterion cannot
   be satisfied, or the change answered a different one — **stops the sign-off and
   goes to the user**, the same routing as an unanswerable attack from the adversary
   and a `/check-adrs` FAIL: rewriting what was asked for is a product call. And a
   **SKIPPED** ledger is a result, not a mis-launch. Plenty of issues here state no
   criteria — bug reports and PRD umbrellas especially — and the answer to that is
   the SKIP, never criteria you write yourself.

4. **`/check-adrs` — honour the recorded decisions.** Verify the diff against the
   ADRs in `docs/adr/` and the ubiquitous language in `CONTEXT.md`. A FAIL is
   either a code fix or a same-PR doc fix (per `[[prefer-source-fix-over-adr]]`)
   — the user's call, surfaced.

   **Launch it in the same message as gate 3.** All four are pure read-and-report —
   none edits the tree, and you apply all four sets of findings afterwards — so
   running them back to back spends the shorter one's wall-clock for nothing
   (4–7 min against code-review's 12 in the run this was measured on). The cost
   is that the other three judge pre-fix code. When code-review's fixes land,
   re-check **only the files they touched** against the constraints `/check-adrs`
   cited and the rows the ledger returned — a read of a handful of lines rather
   than a second run. The adversary needs no re-check: it argues the premise, and
   a correctness fix does not move that.

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
   against each, the current diff, the same context pack the other agents got,
   [`references/agent-briefs.md`](references/agent-briefs.md), and **the transcript
   path of every agent the run spawned**. It answers three
   questions and nothing else:

   - **Does each fix address the finding it cites, without introducing something
     new?** A plausible-but-wrong fix is the failure mode here, and it lands at
     exactly the moment nobody is still looking.
   - **Does each dismissal hold?** "By design per ADR 00xx", "pre-existing", "out
     of scope" are checkable claims, and the agent has the ADRs to check them
     against.
   - **Is the pack faithful to the transcripts?** Both halves of every pair above
     are written by the author from memory of the agent output, so this gate would
     otherwise adjudicate the author's account of a finding against the author's
     reason for dismissing it. Check for findings that were softened, merged into
     another, or dropped on the way in, and check each brief against the prompt
     contract while the file is open. Three of those checks are about **absence**:
     - the adversary and the **acceptance ledger** have transcripts at all — both
       are marked *Fires: every sign-off*, and a SKIPPED ledger is a transcript,
       not the lack of one — and so does the blind arbiter if any two agents split;
     - the adversary's brief carries all six angles Brief A names, and the
       ledger's still enumerates **verbatim, in the issue's order, from the whole
       body** — a brief trimmed to something looser is the same failure as an
       adversary cut to two angles, and shows up only in a hand diff;
     - *a probe named without its value is not a probe* still says the same thing
       in all **three** places it lives: the verdict auditor's template, the
       ledger's, and `/verify`'s own Verdict block. Those two briefs are the only
       ones that demand driven values, and each states the rule inside its own
       fenced block because a brief is sent standalone and cannot cite its sibling.
       The per-brief template check compares each to itself and is blind to them
       drifting apart, so this is the line that holds the copies together — and it
       reads the **files**, since the auditor's sent brief fires in gate 6 and is
       out of reach here. Read only; the wording in `/verify` is `/verify`'s.

     A contract that only forbids things catches a smuggled defence and misses an
     adversary quietly cut from six angles to two, or one that never ran at all.
     The **verdict auditor** is the one mandated agent this gate cannot check: it
     fires inside gate 6, after this one. Nothing in the run can catch its absence,
     so gate 6's own line in the report is what makes it visible.

   **Reading the transcripts.** The paths are the `output_file`s you recorded above.
   Failing that they are in `/tmp/claude-*/<project-slug>/<session-id>/tasks/`, where
   the **symlinks** are agent transcripts and the regular `.output` files are
   backgrounded shell output. Either way a transcript runs to hundreds of KB of JSONL
   and occasionally past 4 MB, so read it with these rather than opening it:

   ```bash
   head -n 1 <transcript> | jq -r '.message.content'   # the brief it was sent
   jq -r 'select(.type=="assistant") | .message.content[]?
          | select(.type=="text") | .text' <transcript>   # what it reported
   ```

   **Don't bound the second one with `tail`.** An extracted report runs to tens of
   lines, not hundreds, and agents here routinely put the verdict *first* — a
   `tail -40` over a 73-line report silently drops the conclusion gate 5 exists to
   compare against. These two extractions are also the standing exception to the
   harness's "do not read a transcript via the shell" warning, which is about
   opening the raw JSONL: both are bounded, and the second is the only way to see
   what an agent actually said.

   It reports; it does not edit. A rejected fix or dismissal goes back to the gate
   that owns it, and that gate's re-run is what closes it — not a second opinion
   from here.

   **It is not a second `/code-review`.** It hunts nothing: given a finding and a
   resolution it judges that one pair, which is a far narrower question than gate
   3's and costs accordingly. **If any gate spawned an agent, this gate runs** —
   the old condition was "if gates 1–4 produced no findings", which the interested
   party decided, about their own run. A run with no findings still has briefs to
   check against the contract, which is work this gate owes whatever the ledger
   says.

6. **`/verify` (the walk-through) — does the shipping code actually work?** Both
   viewports, the golden path, and the **input probes** the skill now names — the
   values a real user's data comes in, at their boundaries, not just the empty and
   error states. This is CLAUDE.md's PR walk-through gate and it is the last thing
   before the commit, so nothing changes under it. A FAIL sends you back to
   whichever gate owns the fix, and then back here.

   **The probe list starts with the ledger's.** Every `MET (probe: …)` row Brief D
   returned is a criterion this diff delivers that nothing automated pins, with the
   value to drive already named — so each one is a probe this pass owes, on top of
   the ones the change's own inputs ask for. Those are the only rows to take: a
   `MET (unpinned: …)` row is one nothing *can* drive, which is what puts it in
   that row rather than this one. Re-read the rows against the code that
   ships before driving them: the ledger judged the pre-fix diff, and gate 3's fixes
   move values. Carry the list in yourself too, because nothing downstream catches a
   criterion-probe you drop — the verdict auditor enumerates from the diff alone,
   and gate 5 has already run.

   The walk-through pass ends with an agent **auditing the verdict against the
   diff**; that step belongs to `/verify` and is defined there, because a verdict
   means the same thing whoever asked for it.

## Keeping the fan-out independent

The fan-out buys fresh **context**, not an independent **position**, unless three
things hold — none of them automatic.

**1. Briefs are neutral, by contract.** The author writes every agent's prompt, so a
brief is where the author's conclusion leaks into the review. The contract — what a
brief carries, what it never carries, and how to present a justification that has to
be *tested* rather than confirmed — is in
[`references/agent-briefs.md`](references/agent-briefs.md). The line it draws is
**description against defence**, with the pair of real briefs that fell either side
of it.

**2. One agent per run argues against merging.** Every other gate presumes the change
is wanted: gate 1 cleans it, gate 3 hunts bugs *within* it, gate 4 checks it against
recorded decisions. Nothing asks whether it should exist. The adversary does, and it
is scoped to the **premise and the choice of fix** — not line-level bugs, which gate
3 owns and which a duplicate agent would only find again. Brief A in the reference.

Its findings enter fix-or-justify like any other, so gate 5 judges the dismissal
against the transcript. The one escalation: **an attack you cannot answer from the
repo's own recorded decisions stops the sign-off and goes to the user.** "Should this
change exist" is a product call, and no agent in this list owns it — the same routing
`/check-adrs` already uses for a FAIL. "It is sound, and here is the attack that came
closest" is a complete result; the brief says so explicitly, because an adversary that
must produce a kill will invent one.

**3. Splits are settled blind, not by the author.** When two agents in the run reach
opposing conclusions **on the same question**, you do not arbitrate. Spawn the blind
arbiter (Brief B), which states its own rules of evidence — including that it may
answer "the precedents point both ways" and pick nothing, a real finding meaning the
repo owes a written criterion it does not have.

Gate 1's three-agent fan-out is where this happens most, but the rule is not scoped
there: gate 3 and gate 4 can split the same way, when a correctness fix runs into a
recorded constraint. The trigger is narrow — *opposing answers to one question*, not
two findings you have to prioritise. **The arbiter's pick is what lands.** If you
override it, that override goes into gate 5's pack as its own finding-and-resolution
pair; a rule that forbade the override outright would be unenforceable, since you
write the code either way.

### What this costs

| Addition | Agents | Wall-clock |
| --- | --- | --- |
| The adversary | +1 | **none** — it rides in gate 3's message and finishes inside the longest gate |
| The acceptance ledger | +1 | **none** — same message, same argument; it reads one issue and one diff |
| The verdict auditor (`/verify`, gate 6) | +1 | serial, a few minutes, after the browser work |
| The blind arbiter | +1 *when a split fires* | serial, on the critical path — most runs never spawn it |
| Gate 5 reading transcripts | none | a handful of extra tool calls inside an agent that already runs |

For scale: the session that carried gates 3–6 of the #331 sign-off spawned three
agents. The three standing additions take a run of that shape from three to six.

## Spending the agents well

Gates 1, 3, 4, 5 and 6 fan out to subagents, and they are the sign-off's critical path —
everything else is minutes, they are tens of minutes. Two things cut that without
losing a finding:

- **Hand each agent a context pack, not just the diff.** Every agent otherwise
  re-discovers the same files: in the measured run, eight agents each independently
  read `log.vue`, `catalog.ts` and the ADRs, at ~15–35 tool calls apiece. Write the
  diff to a scratch file *and* inline the three-to-five files the angle actually
  needs, then say which further reading is expected. Naming the files it will need
  is also what stops it wandering — and it must carry the contract's
  read-anything-else sentence, so the pack cannot double as a fence.
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
   adversary       ✅ SHOULD MERGE — closest attack: "unreachable from the UI" (it isn't; /log posts it)
   acceptance      ⚠️ 6 criteria: 4 MET (AC3 by probe only → gate 6) · 1 PARTIAL (holds only at the cap) → fixed
                   1 MISSING (AC6) → test added; nothing in the diff outside the issue's scope
   blind arbiter   — not spawned (no split)
4. /check-adrs     ⚠️ 1 FAIL → fixed CONTEXT.md (stale auto-deactivate wording)
5. resolutions     ⚠️ 9 judged → 8 upheld; 1 dismissal rejected ("pre-existing" — the diff moved that line) → fixed
                   pack faithful to 6 transcripts; briefs clean
6. /verify (walk)  ✅ desktop + phone; probes: 0 kg ✅ · 300 kg ✅ · goal already reached ✅ · AC3 (ledger) ✅
   verdict audit   ⚠️ 1 UNCOVERED (start date = today) → drove it ✅

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
- **Nothing else asks whether it is finished.** The three gates *Keeping the fan-out
  independent* lists are each scoped to the diff as the context that wrote the diff
  understands it, and so is the adversary — which asks whether the change should
  exist, and whether it is too much, but never whether it is enough. So a misread
  criterion is invisible twice: the feature works, and gate 6 walks through the
  wrong feature working. A change can be sound in premise, clean, well-tested,
  ADR-compliant and deliver three of five criteria with every gate still green,
  which is why the ledger enumerates its rows from the issue and not from the diff.
- **A briefed agent is not an independent one.** Fresh context is not a fresh
  position — but the evidence for that is weaker than it first looked, and the
  transcripts are what weakened it. The framed agent in the run this was written
  from did *not* simply agree: it tested the claim and called its stated reason
  circular, and both agents found the same counter-precedent. What the framing
  bought was a narrower question, asked in the author's terms. That is a milder
  defect than agreement, and it is still the defect the contract exists for — a
  claim to test beats a claim to check.
- **Don't rubber-stamp.** A gate that found nothing is a result worth stating;
  a gate skipped is a gap. If you skip one (e.g. `/verify` SKIP for a docs-only
  change), say which and why.
- **Fix-or-justify is the bar.** Every finding is either fixed or has a one-line
  reason it isn't. An unaddressed finding means the sign-off isn't done.
- This skill assumes the work is built and tested. It is the *exit* gate, not a
  substitute for red-green TDD during development.
