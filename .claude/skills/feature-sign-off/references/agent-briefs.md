# Agent briefs

The prompt contract every fan-out gate's agents are written to, and the five briefs
written out in full here. Copy the brief, fill the bracketed slots, send it.

Why a file rather than prose in the skill: a brief that is a **template** can be
checked. Gate 5 extracts the prompt an agent was actually sent (recipe in the skill's
gate 5) and compares it against the contract below — so "the agents were briefed
neutrally" is a claim with evidence behind it, not a claim about how careful the
author felt. The repo makes this move elsewhere: `app/utils/exits.ts` and
`RunAsCallSitesTest` exist so that a rule stated in three files is executable in one.

## The prompt contract

Applies to **every** agent any gate spawns — the `/simplify` three, the agents
`/code-review` fans out to (it runs inline itself), `/check-adrs`, the resolutions
agent, and the five below.

**A brief carries:**

- What the change does, in the code's own terms. Description, not assessment.
- The diff, or the one command that gets it. The **arbiter** is the one exception:
  it is given the competing positions and told the working tree is not evidence, so
  handing it the diff would hand it the answer.
- The context-pack files, named — plus the sentence that the agent may read anything
  else it wants. The pack is chosen by the author, so it must never be a fence.
- The angle, the output shape, and any read-only constraint.

**A brief never carries:**

- Why a decision was made, or why an alternative was rejected.
- The author's defence of anything, in any voice — including "for context", "note
  that", or a parenthetical.
- Words that presume the change is right: *correctly*, *properly*, *as required*,
  *the fix for*.
- The conclusion of another agent in the same run. Two briefs are exempt because that
  material *is* their subject: the arbiter's, which is given both positions, and the
  **resolutions agent's**, which is given every finding, every dismissal and the
  reason recorded against it. Both exemptions are the input, never a defence — the
  resolutions brief passes dismissals on as claims to check, exactly as the contract
  requires of a justification.

**An adapted brief records the adaptation.** A template's angles may be substituted
or widened for a change they do not fit — a docs-only diff has no UI to be reachable
through — but gate 5 checks a brief against its template and cannot see which
*direction* an edit went, so a cut and a justified swap read identically. Note the
change and why, in the pack, whenever a brief departs from its template.

**Where a justification has to be tested, it is presented as a claim, attributed to
nobody**: "It is claimed that `startedOn` is the only way to create a backdated Goal.
Test that." Never "X, because Y — check I got it right."

The line is **description against defence**, and it is not subtle. Both of these went
to agents in the same sign-off:

| | |
| --- | --- |
| Description — allowed | "The change adds `Goal.started` (refuses a start date in the User's future) and re-anchors `GoalService.createGoal`'s `startWeightKg` on the trend standing on `startedOn`." |
| Defence — forbidden | "It was rejected because `startedOn` is the only way to create a backdated Goal…" |

The second went to one agent *before* asking for its verdict. Read the transcripts
rather than the story: that agent did not simply agree — it called the stated reason
circular and checked it against both files. What the framing cost was the *question*.
It arrived asking whether the author's reason held, and answered that; the agent given
no framing arrived asking what the repo's precedents were, and both ended up at the
same counter-precedent from opposite directions. A defence narrows the question to
itself, which is subtler than agreement and is why the rule is about the brief rather
than about the agent.

## Brief A — the adversary

**Fires:** every sign-off, launched in the same message as gates 3 and 4.
**Costs:** one agent, no wall-clock — it runs concurrently with the longest gate.

```
You are arguing that a change should NOT merge. Read-only: do not edit, create,
delete or move any file. Read-only shell commands only, apart from `git fetch`,
which touches nothing but remote refs.

Repo: <worktree path> (a git worktree — stay in it).
The change: cd <worktree path> && git fetch -q origin &&
  git diff $(git merge-base origin/main HEAD)
The issue it claims to fix: read it yourself with `gh issue view <n>` — do not
take anyone's summary of it.
Already read by other agents, so start here: <context-pack files>
You may read anything else in the repo, including docs/adr/ and CONTEXT.md.

Rules of evidence:
- The issue states a CLAIM. It is not evidence that the problem exists.
- The working tree is not evidence that the change is right. Something being
  implemented says nothing about whether it should be.
- No reasoning in this repo is authoritative because it is written down. An ADR
  is a recorded decision, which is exactly the kind of thing that can be wrong or
  superseded — cite it, then check it still holds.

Attack the PREMISE, not the lines. Another agent is hunting correctness bugs in
this same diff right now; duplicating it wastes you. Your angles:
- Is the defect reachable by a real User, through the UI this app actually ships?
  Or only through an API call nothing makes?
- Does a recorded decision already rule on this, in either direction?
- Is there a smaller or cheaper fix? Is there one that needs no code at all?
- Does the change solve a problem this repo does not have?
- Does it create a state the domain forbids, or widen a surface beyond the defect?
- Is the scope wider than what the issue claims?

Report:
1. Your strongest argument that this should not merge, with the evidence.
2. Every other attack you tried, one line each, and why it failed.
3. A verdict: SHOULD NOT MERGE / SHOULD MERGE.

"It is sound — here is the attack that came closest, and here is exactly why it
fails" is a complete and valued answer. Do not manufacture a kill. An invented
objection costs more to disprove than it was ever worth.
```

**Point it at `gh issue view`, do not paste.** An issue is the one piece of the pack
that exists outside this session, so an agent that fetches it reads what was actually
filed — a paste is an authored artefact again, and a trimmed one is invisible. Where
there is no issue, say so; do not write a substitute.

## Brief B — the blind arbiter

**Fires:** only when two agents in the run reach opposing conclusions on the same
question. Most runs never spawn it.
**Costs:** one agent, on the critical path, when it fires.

```
Two reviewers reached opposing conclusions on one question. Decide it.
Read-only: do not edit, create, delete or move any file.

Repo: <worktree path> (a git worktree — stay in it).

The question: <the single question, phrased so both positions answer it>

Position 1: <the position, and the evidence cited for it>
Position 2: <the position, and the evidence cited for it>

Both positions are unattributed, and that is deliberate — do not try to work out
who said what, or which one is currently implemented. The state of the working
tree is NOT evidence for either: the code was written before this question was
asked, so it cannot answer it.

You may read the repo, the ADRs and CONTEXT.md for precedent.

Report, in this order:
1. Your pick.
2. The strongest case AGAINST your own pick, made properly — not a caveat.
3. Whether that case changes your pick.

If the repo's precedents genuinely point both ways, say so and pick nothing.
"The precedents are inconsistent, and here is where they contradict each other"
is a real finding: it means this repo owes a written criterion it does not have.
```

## Brief C — the verdict auditor

**Fires:** every walk-through pass, never the reachability pass — which puts it
inside gate 6, *after* gate 5, so gate 5 cannot check that it ran. Gate 6's line in
the report is what makes its absence visible.
**Costs:** one agent, serial, after the browser work is done.

```
Audit a walk-through verdict against the change it claims to cover. You are NOT
driving a browser and NOT re-verifying the feature. Read-only: do not edit, create,
delete or move any file. Read-only shell commands only, apart from `git fetch`,
which touches nothing but remote refs.

Repo: <worktree path> (a git worktree — stay in it).
The change: cd <worktree path> && git fetch -q origin &&
  git diff $(git merge-base origin/main HEAD)
The verdict, verbatim: <paste>
Start with the files the change touches; you may read anything else in the repo,
including the tests and the ADRs, to work out what an input's boundaries are.

One question: do the probes named in that verdict cover the inputs this change
accepts, at their boundaries?

Method:
1. From the diff alone, enumerate every input the change adds or widens — a form
   field, a number, a picker, a date, a list, a route or query parameter, a
   request body field. Include inputs it widens by accepting a value it did not
   before.
2. For each, work out the boundaries from the code: the validation rule, the cap,
   the zero, the branch condition, the unit.
3. Check the verdict for a concrete driven VALUE at each of those. A probe named
   without its value is not a probe. A value that resembles the fixtures is not a
   boundary.

Report per input: COVERED (quote the value) / WEAK (quote it, say why it is a
happy-path lookalike) / UNCOVERED, then list the specific values you would drive
for everything not covered.

Do not judge whether the feature is right, whether the code is good, or whether
the verdict's PASS is correct in some larger sense. Only whether its evidence
reaches the input space the diff opened.
```

## Brief D — the acceptance ledger

**Fires:** every sign-off, launched in the same message as gates 3 and 4 — including
a run with no issue, or an issue with no acceptance criteria, which come back SKIPPED
rather than as no agent at all. A condition whose falsity leaves no artefact is a
condition gate 5 has to go hunting for; this way there is always a transcript.
**Costs:** one agent, no wall-clock — it rides gate 3's message like the adversary.

```
Judge a change against the acceptance criteria of the issue it claims to deliver.
You are NOT hunting bugs and NOT reviewing the code's quality. Read-only: do not
edit, create, delete or move any file. Read-only shell commands only, apart from
`git fetch`, which touches nothing but remote refs.

Repo: <worktree path> (a git worktree — stay in it).
The change: cd <worktree path> && git fetch -q origin &&
  git diff $(git merge-base origin/main HEAD)
The issue it claims to deliver: read it yourself with `gh issue view <n>` — do not
take anyone's summary of it. Where the slot names several, there is an issue for
each: ledger them in turn, under their own headings. Where it reads "none" there is
no issue: report SKIPPED and stop.
Already read by other agents, so start here: <context-pack files>
You may read anything else in the repo, including the tests, docs/adr/ and
CONTEXT.md.

One question, asked once per criterion: does this diff deliver it, and what pins it?

Method:
1. From `gh issue view <n>` alone, enumerate every item the issue states as an
   acceptance criterion, verbatim and in the issue's order. `## Acceptance
   criteria` is the usual heading and not the only one — an issue may file more
   under a second heading further down, so read the whole body and take every one
   you find. Do not merge two, split one, or restate one in the diff's vocabulary:
   a criterion rewritten to match the code is a criterion that cannot fail. If the
   issue states none at all, report SKIPPED and stop. Do not write a substitute.
2. For each, find what in the diff delivers it, and what pins it: a named test, or
   a named walk-through probe. Code that appears to do the thing is not a pin.
3. Read each criterion at the boundary it implies, not at its happy path. "Refuses
   a value over the cap" is delivered at the cap, not near it.

Report one row per criterion, in the issue's order, each quoting the criterion and
citing a file:line, a test name, or both:
- MET (test: <name>) — delivered, and that test fails if it stops being delivered.
- MET (probe: <the exact value to drive>) — delivered, pinned by nothing automated,
  and drivable in a browser. Name the value, not the field: a probe named without
  its value is not a probe.
- MET (unpinned: <file:line>) — delivered, and nothing *can* pin it: no test
  reaches it and there is nothing to drive. A criterion satisfied by a document, an
  ADR, a comment or a config line lives here. Cite where it is delivered, and say
  plainly that a regression would be silent.
- PARTIAL — delivered for the stated case, not at the boundary the criterion
  implies. Say which case is missing.
- MISSING — not delivered: no code at all, or code that does not do what the
  criterion asks, or code a test could pin that none does. Say which of the three.
- UNSOUND — the criterion as written cannot be satisfied, or the diff answers a
  different criterion than the one filed. Say which one it answers.

Then once, at the end: behaviour this diff adds that no criterion asked for. Check
it against whatever the issue rules out — an `## Out of scope` section where there
is one, or a sentence saying a thing is not part of this — and quote the ruling it
crosses. Name it; do not judge whether it is good.

A ledger whose every row is MET is a complete and valued answer. Do not manufacture
an UNSOUND — it halts the sign-off and puts the question to a human, so a criterion
you merely find ambiguous is one to read again, not one to reject.

Do not report bugs, style, naming, test quality, or edge cases no criterion
implies — other agents in this run own every one of those. Only whether what was
asked for is here, and what says so.
```

**Brief C is the template, pointed at a different source.** The skeleton is the same
one: enumerate items from a single source, demand a concrete piece of evidence per
item, report the ones that have none. C enumerates from the inputs the diff widens
and is handed a verdict to check them against; D enumerates from the issue and is
handed the diff. Read C before adapting D.

Their shared rule — *a probe named without its value is not a probe*, C's originally,
and what makes a `MET (probe: …)` row something gate 6 can act on rather than a
promise — is written out inside **both** fenced blocks rather than hoisted. A brief is
copied and sent standalone, so D cannot cite C without handing an agent a dangling
reference. That is the same call `exits.ts` and `RunAsCallSitesTest` made: neither
deleted a copy, both linked the copies and added a check over the thing that can
drift. The check here is gate 5's, which reads this file for the rule in both
templates — because gate 5 compares each sent brief against its own template, which
cannot see the two of them drifting together.

**It hunts nothing.** Given a criterion and a diff it judges that one pair, exactly
as the resolutions agent judges a finding-and-resolution pair. That is what keeps it
off gate 3's ground and what makes it cheap.

**Brief A's do-not-paste rule binds it harder than it binds A.** The issue is not one
input among several here — it is the entire source of the ledger's rows, so a trimmed
paste does not weaken the check, it silently decides the result. Both SKIPPED paths are
the same rule as A's: do not write a substitute. Inventing the criteria and then scoring
the change against them is the one move that makes a green ledger mean nothing.

**UNSOUND stops the sign-off and goes to the user.** A criterion that cannot be
satisfied, or that the change deliberately answered differently, is a change to what
was asked for — which is the user's call and no agent's, the same routing Brief A's
unanswerable attack and `/check-adrs`' FAIL already take. **PARTIAL, MISSING and the
scope tail** enter fix-or-justify like any finding, so gate 5 adjudicates a waved-off
PARTIAL against this agent's transcript rather than leaving it a private judgement. A
MET row is not a finding and has no resolution to pair: a `MET (probe: …)` goes to
gate 6 instead, and a `MET (unpinned: …)` is a fact about the change, recorded rather
than resolved.

**The scope tail overlaps Brief A's sixth angle, knowingly.** A asks whether the scope
is wider than the issue *claims* and judges it; D reads what the issue *ruled out* and
inventories it. They are launched in one message off one issue, so expect the same fact
twice on a change that overreaches — the duplicate costs a line in the pack, and the
alternative is that an out-of-scope ruling is checked by nobody, `/check-adrs` covering
the ADRs' rulings and not the issue's.

## Brief E — the lesson miner

**Fires:** every sign-off, after the commit and push (the retro step). A run with
nothing worth recording comes back as exactly that, not as no agent.
**Costs:** one agent, off the critical path — the feature is already pushed.

```
Mine a finished sign-off for lessons the next session should not have to learn
again. Read-only: do not edit, create, delete or move any file. Read-only shell
commands only.

Repo: <worktree path> (a git worktree — stay in it).
The change as committed: git log --stat <base>..HEAD, and git diff <base>..HEAD
The run's agent transcripts: <every transcript path the run recorded>
The resolutions pack: <path>
Read a transcript with these two, never by opening the raw JSONL, and do not
truncate the second with tail:
  head -n 1 <transcript> | jq -r '.message.content'
  jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="text")
         | .text' <transcript>
You may read anything else in the repo, including .claude/skills/, .claude/hooks/,
docs/adr/, CONTEXT.md and the memory index <memory dir>/MEMORY.md.

Look for:
- A finding a gate rejected or reversed: a fix rejected by the resolutions pass,
  a claim the evidence did not support, a test that passed vacuously.
- A defect found late that an earlier gate or the build should have caught.
- A tool, harness or hook behaviour that cost repeated attempts.
- A rule stated in a skill or ADR that the run broke, or that did not fit.

For each lesson, in this order:
1. The lesson in one sentence, as a rule a future session can follow.
2. The evidence: quote the transcript line, the failing output, or the
   measurement. A lesson without evidence is not reported.
3. Its home: the one file a future session would be reading at the moment the
   lesson matters — the skill that owns that step, known-survivors.md, a memory
   entry, a guard test or hook, or an ADR / CONTEXT.md. Name the file and the
   section.
4. Whether it is already there: quote the existing text if so, and say whether
   the lesson sharpens it (replace), duplicates it (drop), or is new (add).

Do not report what the run did well, and do not restate findings the gates
already fixed in the code — a fixed bug is not a lesson unless something about
how it was found should change. "Nothing worth recording" is a complete answer.
```

**It proposes; the author applies.** The miner's value is that it reads what the run
*spent*, which is in the transcripts, rather than what the author remembers
*fixing*. The author still owns every edit, because a lesson's home is a skill or
hook the next session will obey — and those edits go on their own branch.
