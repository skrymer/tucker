# Sign-off report template

The summary `feature-sign-off` emits at the end, for the user and the PR reviewer to
replay. One line per gate, the agents under the gate that launched them:

```
## Feature sign-off — <feature/issue>

0. /verify (reach) ✅ /goal loads and the form submits at 1468px
1. /simplify       ✅ applied 1 cleanup (consolidated kg formatter)
2. /mutation-test  ⚠️ 27/29 killed on 2 files → 1 gap closed (new test), 1 equivalent
3. /code-review md ⚠️ 2 findings → both fixed (double-render, banner copy); 4 by-design
   adversary       ✅ SHOULD MERGE — closest attack: "unreachable from the UI" (it isn't; /log posts it)
   acceptance      ⚠️ 6 criteria: 4 MET (AC3 by probe only → gate 6) · 1 PARTIAL (holds only at the cap) → fixed
                   1 MISSING (AC6) → test added; nothing in the diff outside the issue's scope
   diagrams        ⚠️ 10 diagrams: 9 CURRENT · 1 STALE (ER: new column) → fixed, render checked
   blind arbiter   — not spawned (no split)
4. /check-adrs     ⚠️ 1 FAIL → fixed CONTEXT.md (stale auto-deactivate wording)
5. resolutions     ⚠️ 9 judged → 8 upheld; 1 dismissal rejected ("pre-existing" — the diff moved that line) → fixed
                   pack faithful to 6 transcripts; briefs clean
6. /verify (walk)  ✅ desktop + phone; probes: 0 kg ✅ · 300 kg ✅ · goal already reached ✅ · AC3 (ledger) ✅
   verdict audit   ⚠️ 1 UNCOVERED (start date = today) → drove it ✅
5′. resolutions    — not re-run (gate 6 changed no code); else "N fixes judged → …"

Suites green (detekt/build, lint/test). Committed + pushed to <branch>.
retro              3 lessons → verify (headless hides scrollbars), mutation-test
                   (hand-mutate copies outside app/), 1 memory; PR #<n> on <process-branch>
```
