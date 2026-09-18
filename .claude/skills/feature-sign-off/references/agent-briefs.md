# Agent briefs

The prompt contract every fan-out gate's agents are written to, and the three briefs
that only exist to be adversarial. Copy the brief, fill the bracketed slots, send it.

Why a file rather than prose in the skill: a brief that is a **template** can be
checked. Gate 5 extracts the prompt an agent was actually sent (recipe in the skill's
gate 5) and compares it against the contract below — so "the agents were briefed
neutrally" is a claim with evidence behind it, not a claim about how careful the
author felt. The repo makes this move elsewhere: `app/utils/exits.ts` and
`RunAsCallSitesTest` exist so that a rule stated in three files is executable in one.

## The prompt contract

Applies to **every** agent any gate spawns — the `/simplify` three, the agents
`/code-review` fans out to (it runs inline itself), `/check-adrs`, the resolutions
agent, and the three below.

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
