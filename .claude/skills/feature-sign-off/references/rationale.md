# Why feature-sign-off is shaped this way

The reasoning behind the gates in `SKILL.md`. The rules live there; this is the why,
for when a gate's order or overlap looks arbitrary and you are tempted to change it.

## Contents
- The design notes
- Citations
- Ablation
- What the fan-out costs
- Rendering a diagram
- Transcribing a ruling
- Transcripts across sessions

## The design notes

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
  word on code some reviewer has actually read — and when gate 6 itself changes
  code, gate 5 runs again on that change, or the walk-through's fixes are the one
  part of the diff nobody but its author read. Borrowed from oh-my-claudecode's
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

## Citations

A dismissal's source is a claim, and gate 5 checks it against the thing it names.
#403 dismissed a doc comment's issue number on "REFERENCE cites issues throughout
(#402, #358)"; gate 5 found exactly one. #442 cited three sources that did not say
what was claimed: #443's scope (its midnight criterion is the logging sheet's, not
Today's), ADR 0014 (it says the client owns today, not that a page reads it once)
and a deleted prototype in place of PRD #441, which did hold the tally format. All
three were rejected, and the first turned out to be a regression the user then ruled
into the change. Quoting the source at the moment of writing is what catches it.

## Ablation

#442's phone fix was a header row's `flex-wrap` plus `whitespace-nowrap` on the
heading and the tally. Its test asserted each sat on one line. Ablating one class at
a time showed the test pinned neither: without `flex-wrap` both still sat on one
line while the tally spilled 16px out of the card at 412px (106px at 320), and
without the two `nowrap`s nothing changed down to 320px. The test now also asserts
the tally's right edge sits inside the card, and the dead classes are gone. A layout
test asserts containment, not only line count.

## What the fan-out costs

| Addition | Agents | Wall-clock |
| --- | --- | --- |
| The adversary | +1 | **none** — it rides in gate 3's message and finishes inside the longest gate |
| The acceptance ledger | +1 | **none** — same message, same argument; it reads one issue and one diff |
| The diagram auditor | +1 | **none** — same message; it reads one doc and one diff |
| The verdict auditor (`/verify`, gate 6) | +1 | serial, a few minutes, after the browser work |
| The blind arbiter | +1 *when a split fires* | serial, on the critical path — most runs never spawn it |
| Gate 5 reading transcripts | none | a handful of extra tool calls inside an agent that already runs |

For scale: the session that carried gates 3–6 of the #331 sign-off spawned three
agents. The four standing additions take a run of that shape from three to seven.

## Rendering a diagram

`npx @mermaid-js/mermaid-cli -p pup.json -i block.mmd -o block.png`, where `pup.json`
is `{"executablePath": "<~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome>",
"args": ["--no-sandbox"]}` — without it mmdc exits 2 here. Extract the block with
`awk` from the heading to its closing fence. Don't spend screenshots on GitHub's
preview of a non-C4 block: its mermaid frame froze `Page.captureScreenshot` in two
tabs (#444).

## Transcribing a ruling

An amended ADR, a narrowed criterion and the test that pins a ruling all carry the
user's words, clause by clause, and nothing more. Copy the ruling's sentence from the
issue's Rulings section, then diff the ADR sentence against it before committing; a
paraphrase is where a clause slips in. Give the pinning test one assertion per clause,
each red-proofed with a mutant that implements the alternative the user rejected —
main's own behaviour — not a proxy, which can come back equivalent in the scenario.

Measured: #411 added a clause to an amended ADR. #454 did it twice more — an
amendment that contradicted a sheet in the same diff ("closes itself once it lands"
against ManageTagsSheet), and one generalising "the Food catalog is one keyed read"
into "data more than one surface shows" — and its pinning test asserted only "not
selected" of a ruling that said "created and listed"; gate 5 rejected all three. Its
first mutant (`v-if step !== 'grams'`) came back equivalent, and its "row edit
untouched" assertion was never told apart by any mutant: a guard, not a pin.

## Transcripts across sessions

A transcript lives at `~/.claude/projects/<slug>/<session>/subagents/agent-<id>.jsonl`;
the `tasks/<id>.output` symlink in `/tmp` points at it. After a session switch the
harness repoints an earlier agent's symlink to the *new* session's copy, and that is
where its handback lands — the old copy ends before it. Record that path in the pack,
and check where the symlink points before relaunching an agent that "never reported":
#454 relaunched check-adrs one second after the original's handback had landed there.

