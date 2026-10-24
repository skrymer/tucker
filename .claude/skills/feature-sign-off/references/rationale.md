# Why feature-sign-off is shaped this way

The reasoning behind the gates in `SKILL.md`. The rules live there; this is the why,
for when a gate's order or overlap looks arbitrary and you are tempted to change it.

## Contents
- The design notes
- Why /verify runs twice
- Citations
- Dismissals rest on evidence
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

## Why /verify runs twice

Gates 1 and 3 change behaviour as a matter of course, so a single up-front walk-through
is stale by the time the code is final — measured, not feared: in the run this order
was written from, `/simplify` changed an error state and `/code-review` changed the
feature's own matching rule, and the walk-through had to be redone anyway. So the cheap
half runs first, to stop the expensive gates being spent on a surface that does not
load, and the real one runs last, on the code that ships.

## Citations

A dismissal's source is a claim, and gate 5 checks it against the thing it names.
#403 dismissed a doc comment's issue number on "REFERENCE cites issues throughout
(#402, #358)"; gate 5 found exactly one. #442 cited three sources that did not say
what was claimed: #443's scope (its midnight criterion is the logging sheet's, not
Today's), ADR 0014 (it says the client owns today, not that a page reads it once)
and a deleted prototype in place of PRD #441, which did hold the tally format. All
three were rejected, and the first turned out to be a regression the user then ruled
into the change. Quoting the source at the moment of writing is what catches it.

## Dismissals rest on evidence

A claim about what the code does is a source too, and a test that passed on the unfixed
code is not evidence that nothing is wrong. #496 dismissed a stale-clock finding because
the test written to show it was green without the fix; gate 5 rejected it ("a passing
test with an unidentified mechanism does not show the finding is false"), and the defect
reproduced once the assertion took its original form. Two more dismissals that run rested
on an unquoted claim: that the sheet stays open until a reload (the composable closes it
first) and that no nested route exists to use as an example (the matcher takes any path).
Show the assertion red on a scratch copy of the pre-fix code, and quote the line.

A claim that **nothing in the repo does X** carries the search that would have found X:
start at the precedent the finding itself cited, and search without a context window
piped into a second filter. #497 dismissed "no smoke issues concurrent writes" on
`grep -B1 -A3 'Promise.all' … | grep post`, whose three-line window stopped one line
short of the POST in the very file the efficiency agent cited. And a **measurement**
offered as evidence checks every response's status (`curl -sf`, or
`-w '%{http_code}'`) and times the path the code under judgement takes: the same
dismissal's timing script discarded statuses and went through the dev proxy while the
smoke calls the backend directly. Gate 5 rejected both.

## Ablation

#442's phone fix was a header row's `flex-wrap` plus `whitespace-nowrap` on the
heading and the tally. Its test asserted each sat on one line. Ablating one class at
a time showed the test pinned neither: without `flex-wrap` both still sat on one
line while the tally spilled 16px out of the card at 412px (106px at 320), and
without the two `nowrap`s nothing changed down to 320px. The test now also asserts
the tally's right edge sits inside the card, and the dead classes are gone. A layout
test asserts containment, not only line count.

A silent ablation is not proof a part is dead, only that no test sends what reaches it.
#520's `Server-Timing` fix overrode both `sendError` forms; removing the one-arg override
turned no e2e test red, so it was deleted — and the next `/check-adrs` run found Spring's
malformed-body 400 calling exactly that form, unstamped. A not-JSON e2e test went red,
and the override came back.

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

Mermaid parses a diagram that no longer reads, and the C4 renderer places elements by
statement order, so one new element can push a label through a box. For a C4 block
read GitHub's preview: headless Chrome reports `screen.availWidth` as 800px, so it
draws two per row whatever `UpdateLayoutConfig` says. A flowchart or ER block is
checked headless:

`npx @mermaid-js/mermaid-cli -p pup.json -i block.mmd -o block.png`, where `pup.json`
is `{"executablePath": "<~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome>",
"args": ["--no-sandbox"]}` — without it mmdc exits 2 here. Extract the block with
`awk` from the heading to its closing fence. Don't spend screenshots on GitHub's
preview of a non-C4 block: its mermaid frame froze `Page.captureScreenshot` in two
tabs (#444). An edit to a drawn chain is checked against the framework's own order
(Spring Security's `FilterOrderRegistration`), not only its render: #521 drew on top
of a CSRF-after-JWT order that was never true.

## Transcribing a ruling

An amended ADR, a narrowed criterion and the test that pins a ruling all carry the
user's words, clause by clause, and nothing more. Copy the ruling's sentence from the
issue's Rulings section, then diff the ADR sentence against it before committing; a
paraphrase is where a clause slips in. A ruling given in chat to a question is the
question's words: every consequence the question named is a clause the answer
accepted, and lands in the doc it named (an ADR, DESIGN.md, an issue) as named —
#474 asked to record a dot "as an exception to 'colour is never the only signal'",
wrote instead that it was none, and gate 5 rejected it. Give the pinning test one assertion per clause,
each red-proofed with a mutant that implements the alternative the user rejected —
main's own behaviour — not a proxy, which can come back equivalent in the scenario.
An ADR edit that narrows a claim can contradict text the diff never shows: before
committing it, read the whole ADR, `git grep` the narrowed terms across the code's
KDoc too, and check each factual claim the rewrite adds against the code.

Measured: #411 added a clause to an amended ADR. #454 did it twice more — an
amendment that contradicted a sheet in the same diff ("closes itself once it lands"
against ManageTagsSheet), and one generalising "the Food catalog is one keyed read"
into "data more than one surface shows" — and its pinning test asserted only "not
selected" of a ruling that said "created and listed"; gate 5 rejected all three. Its
first mutant (`v-if step !== 'grams'`) came back equivalent, and its "row edit
untouched" assertion was never told apart by any mutant: a guard, not a pin. #521's
ADR 0014 edit contradicted text outside the diff and took four commits and three
re-checks: the ADR's next paragraph, then `ClockConfig`'s KDoc, then a test claim no
test made.

## Transcripts across sessions

A transcript lives at `~/.claude/projects/<slug>/<session>/subagents/agent-<id>.jsonl`;
the `tasks/<id>.output` symlink in `/tmp` points at it. After a session switch the
harness repoints an earlier agent's symlink to the *new* session's copy, and that is
where its handback lands — the old copy ends before it. Record that path in the pack,
and check where the symlink points before relaunching an agent that "never reported":
#454 relaunched check-adrs one second after the original's handback had landed there.

