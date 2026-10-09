---
name: feature-sign-off
description: The pre-commit/push sign-off gate for a finished feature or fix on the Tucker repo. Runs seven quality gates in order — /verify twice (a reachability pass first, the two-viewport walk-through last, on the code that ships), with /simplify, /mutation-test, /code-review, /check-adrs and a resolutions pass (nothing approves its own fix) in between — fixing what each surfaces, then commits and pushes, then a retro that routes each lesson into the file the next session will read it from. Every agent is briefed to a neutrality contract, one argues against merging, one ledgers the diff against the issue's acceptance criteria, one checks the architecture diagrams still draw the code, and a split between two agents is settled blind. Use when a change is functionally complete and the user says "sign off", "ready to commit/push", "wrap up this feature", "run the gates", or before opening a PR.
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
   path, no probes. Two minutes. FAIL or BLOCKED stops the sign-off before an agent
   is spawned — fix, re-run. Its one-line verdict opens gate 5's pack (#464 left it out).

1. **`/simplify` — clean it up.** Apply reuse / simplification / efficiency /
   altitude cleanups to the changed code. It *edits* the working tree, so run it
   before the bug hunt — the reviewer then reads the code you're actually
   shipping, not a draft. Re-run the relevant tests after it applies fixes. Every fix,
   an agent's remedy most of all, is read against the issue's criteria first (#464).

   It fans out to **three** review agents in parallel — reuse+simplification (one
   agent: the two shared 3 of 3 findings when split), efficiency, and altitude — each
   sent its angle line verbatim from [`references/agent-briefs.md`](references/agent-briefs.md#the-simplify-angles--gate-1).

   **Sweep the doc comments in the same pass.** Every JSDoc/KDoc the diff adds or
   touches must be brief, present-tense, and non-obvious: it says what the thing
   *is* and any rule a reader would get wrong, and nothing the signature already
   says. Delete changelog prose ("used to…", "previously…", "changed so…"),
   issue/PR numbers, and bug narration — git and ADRs hold the why. Longer rationale
   goes in a linked ADR. A cross-reference repointed off a deleted symbol is re-read
   against its new target: the link resolves while the claim goes false (#464). A layout finding (a line too long, a
   comment to rewrap) is closed by measuring it, not by assuming an edit or the
   formatter reflowed it: #407 recorded a rewrap as done, and gate 5 found the
   111-character line still there.

2. **`/mutation-test` — do the tests actually catch bugs?** Run the engine for **each
   stack the diff touches** — StrykerJS over Vitest in `frontend/`, pitest over the
   fast JUnit suite in `backend/` — **scoped to the source this change touched**, and
   give every surviving mutant one of that skill's four verdicts — a real gap (write
   the missing test), a kill by an out-of-scope layer (name the spec), an equivalent
   mutant (record why), or a false survivor the engine never ran a test against (settle
   it by hand-mutating). It runs here, not later, for two reasons: the code is final
   after gate 1, and it *adds tests* that gate 3 must then review. The browser and
   container layers are out of scope in both, so keep checking those by hand (an
   unanchored aria-snapshot regex and a substring `getByText` both pass a change they
   should have caught). Budget roughly a minute for a frontend scope and a few for a
   backend one. SKIP the stack with a note if the diff touches no mutable source there
   (docs, config, tests only); that skill's step 1 owns the base, the command and the
   SKIP-vs-STOP rule.

3. **`/code-review medium` — hunt correctness bugs.** Review the (now-simplified)
   diff for real bugs. **Run it at `medium` effort**, not the default high: at
   medium, `/code-review` focuses on its correctness angles and drops the reuse /
   simplification / efficiency / altitude angles — which `/simplify` just ran and
   applied in gate 1. Running it high here would re-do that cleanup pass for no
   gain. Medium gives cleanup-once (gate 1) + correctness-once (gate 3) with no
   overlap. Triage every finding: fix the genuine ones, and for each you *don't*
   fix, say why (by-design per an ADR, pre-existing, out of scope). Don't let an
   unexplained finding through. **Every source a dismissal cites is quoted as it
   stands when the dismissal is written** — an ADR, another issue's scope
   (`gh issue view`), a precedent (`git grep` on `origin/main`) — never a handoff or
   prototype that no longer exists ([rationale](references/rationale.md#citations)).
   **"Pre-existing" holds only if the harm is reachable on `main`** — a root cause that predates the diff, given a new consumer
   by it, is the diff's harm: F18 slice 6 called a JS/Kotlin trim split pre-existing,
   and gate 5 rejected it because the slice's own merge preview turned a harmless
   refusal into an unannounced merge. **Nor is "by design", "transient" or
   "accepted" a resolution for a harm the diff makes worse than `main`** — a
   regression is fixed, red-first, in the same change; only a genuinely new scope
   question goes to the user as a choice. #358 dismissed a stale-bundle fallback as
   "by design: transient"; it was a regression, and was fixed.

   **Judge each state by what the User sees in it**, not by whether a function's
   return value is right on its own terms. When a fix narrows one read of some rows,
   list every *other* reader of those rows and walk each through the states — none
   standing, a stale one standing, a later one existing. #358's inline review wrote
   "`isOverdue` with a future latest (negative days, not overdue)" as a check that
   passed; that branch was a regression ("No budget yet" on the device behind), one
   of three the narrowed read produced against the unbounded one, all found by later
   gates. (Bump to high only if the diff is large or security-sensitive and you want
   the broader net despite the redundancy.)

   **Launch the adversary (Brief A) in this same message.** `/code-review` runs
   inline, so the adversary is a background agent alongside it and gate 4. See
   *Keeping the fan-out independent* below for what it is and why it is not a
   fourth reviewer.

   **Launch the acceptance ledger (Brief D) in this same message too.** It reads the
   same issue the adversary does and asks the one question the adversary's angles do
   not: not whether the change should exist, nor whether it is too much, but whether
   it is enough. It emits one row per acceptance criterion, then once, at the end,
   behaviour in the diff that no criterion asked for — and nothing else. See
   *Nothing else asks whether it is finished* in
   [`references/rationale.md`](references/rationale.md) for why no other gate
   asks this; Brief D in the reference for the rows it emits, what pins each, and
   why it is not a fifth reviewer.

   Two of its outcomes need handling here. An **UNSOUND** row — the criterion cannot
   be satisfied, or the change answered a different one — **stops the sign-off and
   goes to the user**, the same routing as an unanswerable attack from the adversary
   and a `/check-adrs` FAIL: rewriting what was asked for is a product call. And a
   **SKIPPED** ledger is a result, not a mis-launch. Plenty of issues here state no
   criteria — bug reports and PRD umbrellas especially — and the answer to that is
   the SKIP, never criteria you write yourself.

   **Launch the diagram auditor (Brief F) in this same message as well.** It asks
   whether `docs/architecture.md` still draws the code after this diff — one row per
   diagram, CURRENT or STALE, and a MISSING tail for anything new that no diagram
   draws. Nothing else in the run reads those diagrams, and a stale one is silent:
   it renders, it parses, and it is wrong. STALE and MISSING rows enter
   fix-or-justify, and the fix ships **on the feature branch**, because the diagrams
   describe the code rather than the process.

   **Check a diagram edit against its render, not its source.** Mermaid parses a
   diagram that no longer reads, and the C4 renderer places elements by statement
   order, so one new element can push a label through a box. For a C4 block read
   GitHub's preview: headless Chrome reports `screen.availWidth` as 800px, so it
   draws two per row whatever `UpdateLayoutConfig` says. A flowchart or ER block is
   checked headless ([recipe](references/rationale.md#rendering-a-diagram)).

4. **`/check-adrs` — honour the recorded decisions.** Verify the diff against the
   ADRs in `docs/adr/` and the ubiquitous language in `CONTEXT.md`. A FAIL, or an
   UNCERTAIN that a doc overstates the code, is a code fix or a same-PR doc fix: the
   user's call, with both offered (#455 offered only wordings; gate 5 sent it back).
   `[[prefer-source-fix-over-adr]]` picks a fix's form, never its content: copy the ruling
   from the issue, diff the ADR, pin it clause by clause ([how](references/rationale.md#transcribing-a-ruling)).

   **Launch it in the same message as gate 3**, as a background agent briefed to
   follow `.claude/skills/check-adrs/SKILL.md` — that is this gate's standard form,
   not an adaptation for the pack to record. All five are pure read-and-report —
   none edits the tree, and you apply all five sets of findings afterwards — so
   running them back to back spends the shorter one's wall-clock for nothing
   (4–7 min against code-review's 12 in the run this was measured on). The cost
   is that the other four judge pre-fix code.

   **Commit before launching them, and point every brief at the commit**
   (`git diff <base> <sha>`, `git show <sha>:<path>`), never at the working tree.
   `/code-review` runs inline in this same message and its fixes start landing while
   the four still read; in #435 `/check-adrs` reported the composable changing under
   it, and the ledger judged a semantics that no longer shipped.

   When code-review's fixes land, re-check **only the files they touched** against
   the constraints `/check-adrs` cited and the rows the ledger and the diagram
   auditor returned — a read of a handful of lines rather than a second run. A
   ledger row is re-checked against **the criterion's own words**, not the ADRs: a
   fix that now answers a different criterion than the one filed is UNSOUND and goes
   to the user, exactly as the ledger's own UNSOUND would. #435's denied-camera fix
   honoured every ADR and silently contradicted AC6 as written; gate 5 caught it.
   Likewise any item an agent explicitly marks "the user's call" goes to the user —
   the pack does not decide it. The adversary needs no re-check: it argues the
   premise, and a correctness fix does not move that.

   **Gate 2's verdicts do need one, after every later fix** — gate 2's own triage's,
   gate 3's, a gate-5 re-resolution's, a gate-6 fix's: re-run the scoped mutation sweep over the files
   the fix touched, because a verdict on a changed line no longer stands. Measured in
   F18 slice 5: an "equivalent, guard mode never aborts" survivor became a real gap
   the moment a gate-3 fix switched that read to `latest`. Measured in #435: two
   fixes written after gate 5 each left a new real gap only the re-sweep found.
   The one exception is a fix confined to a `.vue` template: Stryker mutates the
   `<script>` block only, so there is nothing new to sweep — say so in the pack
   rather than skipping silently.

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
   path of every agent the run spawned**. A control the pack cites is saved output at a
   named path: the agent is read-only, so a question only a run can answer needs that
   run supplied — or the brief allows a throwaway copy in the scratchpad and says so.
   Take it on the file as committed — after Prettier and the pre-commit hook — and
   stamp it with `git rev-parse HEAD:<file>` (#408), and every saved run log with `git
   rev-parse HEAD` + `git status --short`: #455's unstamped logs cost gate 5 two rebuilds.
   That copy runs lint and typecheck but **not Vitest**, which cannot resolve modules
   through the symlinked `node_modules` (measured, #402), so any test result the agent
   may need goes in the pack as saved output.
   It answers three questions and nothing else:

   - **Does each fix address the finding it cites, without introducing something
     new?** A plausible-but-wrong fix is the failure mode here, and it lands at
     exactly the moment nobody is still looking.
   - **Does each dismissal hold?** "By design per ADR 00xx", "pre-existing", "out
     of scope" are checkable claims, and the agent has the ADRs to check them
     against. Two are never valid and the agent rejects them on sight: a harm the
     diff makes worse than `main` recorded as accepted (it is a regression, and
     gets fixed — never offer "accept and record" as an option), and a tool's
     refusal as the reason something was left ("Probity refused the extract" says
     nothing about whether the extract is worth doing).
   - **Was an existing test edited to make the change pass?** That edit is a
     finding, not housekeeping, and it belongs in the pack: ask what a User in the
     state the old test described now sees. In #358 a test moved its day to
     `LocalDate.now()` unrecorded — it was the device-behind regression, seen from
     the test side.
   - **Is the pack faithful to the transcripts?** Both halves of every pair above
     are written by the author from memory of the agent output, so this gate would
     otherwise adjudicate the author's account of a finding against the author's
     reason for dismissing it. Check for findings that were softened, merged into
     another, or dropped on the way in, and check each brief against the prompt
     contract while the file is open. Three of those checks are about **absence**:
     - the adversary, the **acceptance ledger** and the **diagram auditor** have
       transcripts at all — all three are marked *Fires: every sign-off*, and a
       SKIPPED ledger or an all-CURRENT audit is a transcript, not the lack of one —
       and so does the blind arbiter if any two agents split;
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
       out of reach here. Read only; the wording in `/verify` is `/verify`'s. The
       files are also pinned by `.claude/hooks/probe-rule.test.mjs`, which CI runs —
       added after `/verify`'s copy was found to have drifted to a weaker rule — so
       this check is now about the *sent* briefs.

     A contract that only forbids things catches a smuggled defence and misses an
     adversary quietly cut from six angles to two, or one that never ran at all.
     The **verdict auditor** is the one mandated agent this gate cannot check: it
     fires inside gate 6, after this one. Nothing in the run can catch its absence,
     so gate 6's own line in the report is what makes it visible.

   **Reading the transcripts.** The paths are the `output_file`s you recorded above.
   Failing that, the **symlinks** in `/tmp/claude-*/<slug>/<session>/tasks/` — check
   where one points before relaunching an agent: after a session switch the handback
   lands in the new session's copy ([how](references/rationale.md#transcripts-across-sessions)). A transcript runs to hundreds of KB of JSONL
   and occasionally past 4 MB, so read it with these rather than opening it:

   ```bash
   head -n 1 <transcript> | jq -r '.message.content'   # the brief it was sent
   jq -r 'select(.type=="assistant") | .message.content[]?
          | if .type=="text" then .text
            elif (.type=="tool_use" and .name=="SubagentHandback")
              then "HANDBACK: " + .input.message
            else empty end' <transcript>                 # what it reported
   ```

   **The report is in the `SubagentHandback` call, not the text blocks.** Agents
   return their full report through that tool; their text output is only a closing
   line ("sent in full"). A text-only extraction therefore compares the pack against
   summaries — F18 slice 6's gate 5 did exactly that, and could not confirm a
   paraphrase it was there to check.

   **Don't bound the second one with `tail`.** An extracted report runs to tens of
   lines, not hundreds, and agents here routinely put the verdict *first* — a
   `tail -40` over a 73-line report silently drops the conclusion gate 5 exists to
   compare against. These two extractions are also the standing exception to the
   harness's "do not read a transcript via the shell" warning, which is about
   opening the raw JSONL: both are bounded, and the second is the only way to see
   what an agent actually said.

   It reports; it does not edit. A rejected fix or dismissal goes back to the gate that
   owns it, and that gate's re-run is what closes it — not a second opinion from here.

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

   **If this gate changed code, gate 5 runs again before the commit** — the fixes
   for the walk-through's FAILs, and for anything the verdict auditor turned up.
   Those fixes are written after gate 5, last and under the most time pressure,
   which is exactly the profile gate 5 exists for; skipping it ships them with no
   reader but their author. Measured: F18 slice 1's walk-through found four real
   bugs, and their fixes merged unreviewed, flagged only in the PR description.
   Scope the re-run to what changed since gate 5 (`git diff <gate-5 commit>`), with
   each walk-through finding as the finding and the fix as its resolution. Then
   re-drive only the probes those fixes touch, not the whole walk-through. If
   the walk-through changed nothing, there is nothing to re-run.

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

The arbiter is for a judgement. A split one reproducible run decides — does this lint
rule refuse that line, does this test go red — is settled by the run instead: save its
output, cite it in gate 5's pack, and record there that the agents split and why no
arbiter was spawned. #408 settled such a split by a lint run and left it unrecorded,
which gate 5 sent back.

Gate 1's three-agent fan-out is where this happens most, but the rule is not scoped
there: gate 3 and gate 4 can split the same way, when a correctness fix runs into a
recorded constraint. The trigger is narrow — *opposing answers to one question*, not
two findings you have to prioritise. **The arbiter's pick is what lands.** If you
override it, that override goes into gate 5's pack as its own finding-and-resolution
pair; a rule that forbade the override outright would be unenforceable, since you
write the code either way.

The agent count and wall-clock each addition costs: [references/rationale.md](references/rationale.md#what-the-fan-out-costs).

## Spending the agents well

Gates 1, 3, 4, 5 and 6 fan out to subagents, and they are the sign-off's critical path —
everything else is minutes, they are tens of minutes. Two things cut that without
losing a finding:

- **Hand each agent a context pack, not just the diff.** Every agent otherwise
  re-discovers the same files: in the measured run, eight agents each independently
  read `log.vue`, `catalog.ts` and the ADRs, at ~15–35 tool calls apiece. Write the
  diff to a scratch file — **one per gate** (`diff-gate1.patch`, `diff-gate3.patch`),
  never one shared file rewritten as fixes land, or gate 5 cannot replay what an
  agent judged (#358's gate-1 input was overwritten) — *and* inline the
  three-to-five files the angle actually needs, then say which further reading is expected. Naming the files it will need
  is also what stops it wandering — and it must carry the contract's
  read-anything-else sentence, so the pack cannot double as a fence.
- **Batch the fixes, not one test run each.** Findings arrive in groups and most are
  independent. Apply a whole gate's worth, then run the touched spec once. Except a fix
  you prove by hand-mutation — one at a time, to watch that single mutant die — and a
  test that passes on write because the code already delivers it (a gate-3 ledger gap,
  say): show its red on a throwaway copy, or with `-PmutationFullMatrix` on the backend,
  never by mutating the source in place, which the TDD hook refuses. `mutation-test`
  carries both recipes. "It passes on write, so it can't go RED" never leaves behaviour
  unpinned; gate 5 rejects it. **Save every red as it fails.** A fix that corrects a
  claim first `git grep`s its wording: #411 fixed CLAUDE.md, missed the hook's comment.

  Every gate fix follows a large agent report, which is exactly when Probity loses
  the run's test history and refuses a genuine RED as circular. Re-run the target
  test class unfiltered immediately before writing each fix's RED; never route
  round a refusal by writing gated files through Bash.

## After the gates

Only once all seven are green (or every non-green item is fixed or explicitly
justified):

1. Run the fast suites once more if any gate changed code — backend `./gradlew
   detekt build`, frontend `pnpm lint && pnpm typecheck && pnpm test`, also before
   each gate's own commit (gate 2 commits tests; #454's broke typecheck unseen).

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
4. **Retro — what should the next session not have to learn again?** Every run
   pays for lessons: a trap that cost twenty minutes, a gate that caught what an
   earlier one should have, an assumption that turned out false. Left in the
   conversation they die with it, and a `/tmp` handoff is read once. So the last
   step routes each lesson into **the file it would have been read from** — the
   next session reads that file anyway, and nothing else.

   Spawn **Brief E** ([`references/agent-briefs.md`](references/agent-briefs.md)),
   handing it the transcript paths you recorded for gate 5 plus the resolutions
   pack. It proposes; you apply. The miner exists for the same reason the verdict
   auditor does: the person who fell into the trap is the one worst placed to see
   which falls were worth recording, and the transcripts show the time spent where
   the author's memory shows the fix.

   Where a lesson lands:

   | Lesson | Home |
   | --- | --- |
   | A trap in a tool or a step | the skill that owns the step (`verify`, `mutation-test`, `frontend-dev`, …) — its gotchas |
   | A mutant's standing verdict | `mutation-test/references/known-survivors.md` |
   | The user's preference or correction | memory, as a `feedback` entry |
   | A rule broken more than once | a guard test or hook — prose did not hold it |
   | A domain or design ruling | the ADR or `CONTEXT.md` — `/check-adrs` already owns this, so it is rarely new here |

   Three rules. **Evidence or nothing** — each lesson cites the transcript line, the
   failing run or the measurement that taught it; a hunch is not a lesson. **Edit,
   don't append** — a lesson that sharpens an existing gotcha replaces it, and one
   already recorded is dropped. **Its own branch** — skill and hook edits go on a
   process branch and PR, never onto the feature branch that surfaced them
   (`[[process-changes-get-their-own-branch]]`); memory entries are written
   directly. "Nothing worth recording" is a result, and the report says so.

## Reporting

Emit a short sign-off summary the user (and PR reviewer) can replay, in the shape of [references/report-template.md](references/report-template.md).

## Notes

Why the gates sit in this order, why two overlap, and why a briefed agent is not an independent one: [references/rationale.md](references/rationale.md). The rules:

- **Don't rubber-stamp.** A gate that found nothing is a result worth stating;
  a gate skipped is a gap. If you skip one (e.g. `/verify` SKIP for a docs-only
  change), say which and why.
- **Fix-or-justify is the bar.** Every finding is either fixed or has a reason it
  isn't — one that answers **each** remedy the finding names, not only the first (#400,
  #455). A mid-sign-off handoff passes findings and every remedy on, never verdicts: #455's
  "justify, don't fix" list held three dismissals gate 5 rejected. An unaddressed finding
  means the sign-off isn't done.
- **"Verify on device" is a resolution only once the probe is in the issue.** A risk
  deferred to a post-deploy or on-device check is written into that acceptance
  criterion, with the exact steps, in the same step as the deferral — or nothing will
  ever run it. #435 deferred an Android event-order risk and the safe-area insets to an
  on-device criterion that listed neither; gate 5 rejected both. Prefer designing the
  dependency out (the event order became code with both orders tested) over deferring.
- **A fix is pinned only by a test that fails when the fix's wiring is removed.** Prove
  it with that control — delete the call, show the named test red — and save the output.
  A check installed in a hook (`afterEach`) is pinned only through the hook: in Vitest
  that is an `it.fails` test, since a hook error counts as its expected failure. #400's
  first fix called the assertion directly; removing it from `afterEach` left the suite
  green, and gate 5 rejected it. A fix of several parts is ablated **part by part**, on a
  fresh copy without `build/`; a part whose removal changes nothing is deleted
  ([rationale](references/rationale.md#ablation)).
- This skill assumes the work is built and tested. It is the *exit* gate, not a
  substitute for red-green TDD during development.
