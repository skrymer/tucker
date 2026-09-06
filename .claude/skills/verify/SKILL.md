---
name: verify
description: The runtime walk-through gate for Tucker — drive the real app in a real browser with the claude-in-chrome MCP tools, at both phone and desktop viewports, and emit a verdict a reviewer can replay. Runs twice in feature-sign-off: a one-viewport reachability pass before the other gates, and the full walk-through last, on the code that ships. Use when a change is functionally complete and you need runtime evidence it actually works, when the user says "verify this", "walk it through", "does it actually work", or before opening a PR that touches a user-facing surface. This is runtime behaviour only — /code-review checks correctness and /check-adrs checks recorded decisions.
---

# Verify (Tucker)

**Gates 0 and 5 of [`feature-sign-off`](../feature-sign-off/SKILL.md).** Tests prove the
code does what you told it to; this proves the *app* does what the user needs. Automated
tests can't catch an overlapping toast, a broken responsive layout, a focus trap, or a
control that's unreachable one-handed — a walk-through can.

## Two passes, because the code changes underneath you

This runs **twice**, and they are not the same run:

- **Reachability (gate 0)** — one viewport, the golden path, no edge probes. It answers
  "does the surface load and do the thing at all", so nobody reviews code that does not
  run. Two minutes. A FAIL here stops the sign-off before an agent is spawned.
- **The walk-through (gate 5)** — both viewports, the golden path *and* the input probes
  below. It runs **last**, on the code that ships.

The split exists because `/simplify` and `/code-review` change behaviour, every time —
in the run this was written from, both did, and a single up-front walk-through was stale
twice over. Verifying once, at the end, on final code, is the point; the cheap first pass
only stops the expensive gates being spent on a broken surface.

**Real browser, via `claude-in-chrome`.** A scripted Playwright drive is **not** a
substitute; it's a fallback only when no browser is connected, and then you must say so
explicitly in the verdict.

## Workflow

1. **Bring the stack up.** `docker compose up -d backend` (repo root), then `pnpm dev`
   in `frontend/`. Wait for both before navigating.
2. **Seed what the surface needs**, via `curl` against `http://localhost:8080/api`, not
   the UI — you're verifying *your* change, not re-testing setup. Most screens need a
   Calorie Budget, which needs profile + weight + goal. Check what's already there
   first: `curl -s "http://localhost:8080/api/summary?date=<today>"`.
3. **Walk the golden path** at **desktop**, then **repeat at phone width**. Tucker has a
   real responsive split (side-nav vs bottom-tabs, modal vs bottom sheet, header button
   vs FAB) — a single-viewport walk-through misses half the layout. (Gate 0 stops here,
   at one viewport.)
4. **Probe the input space, then the states.** See below — this is the step that earns
   the gate, and the one most easily reduced to nothing.
5. **Emit the verdict** (below).
6. **Clean up**: stop the dev server you started and delete any scratch asset you
   dropped into the repo. Confirm with `git status --short`.

## Probing — inputs first, states second

"Probe two edges" is read as *empty state and error path* and that is not enough: those
are states the app puts itself in, and the bugs live in the values **the user** puts in.

**Probe the inputs your change accepts, at their boundaries, before anything else.** For
each input the change added — a text field, a number, a picker, a barcode — ask what
shapes a real user's data comes in, and drive at least one of each:

| Input | Shapes that have bitten Tucker |
| --- | --- |
| A text query | a **capitalised** word (every Food name starts with one), an **accented** name, whitespace alone, the empty string, a word matching nothing |
| A number | zero, the boundary of its rule, one past it, a decimal where an integer is expected |
| A list | none, one, the cap, one past the cap |
| A date | today, a local midnight, a day the rule spans |

Then the states: empty/zero, the error path, the reset. Two of those, chosen by what the
change could plausibly have broken.

The rule this replaces let two user-facing bugs through in one slice. F16 slice 2's
filter was walked with three queries — `oli`, `skyr`, `quinoa` — all lowercase and all
matching, so the fact that a **capitalised** query found nothing was invisible, as was an
accented Food being unreachable by any spelling a phone keyboard reaches easily. Both
survived 759 tests and a 100% mutation score on the file that held them, and were found
by `/code-review` two gates later. **Pick probe values your fixtures do not already
resemble** — a value that looks like the happy path is not a probe.

## Viewports — the part that bites

- `resize_window` **reports success even when nothing moved.** Always confirm with
  `javascript_tool` → `window.innerWidth`. Ignore `read_page`'s "Viewport:" line.
- **A maximized window silently refuses to resize** (no `wmctrl`/`xdotool` under
  Wayland). If two resize attempts don't move `innerWidth`, **ask the user to
  unmaximize the Chrome window** — one sentence, and the next resize works.
- **Ask before the desktop pass, not after it.** The resize only fails at the
  *phone* step, which is halfway through the gate, so the question lands after the
  stack is up and the desktop walk is done — and then everything waits on a human.
  One `resize_window` + `innerWidth` check at the very start costs one tool call
  and moves the question to a moment where the user can answer it while you seed
  data.
- **Chrome floors at ~555px wide**, so Pixel-7 width (412px) is unreachable. 555px is
  still under Tucker's 1024px breakpoint, so the phone layout *is* genuinely exercised
  — say which width you actually used. For a true 412px check, lean on the Playwright
  **Mobile Chrome** project.
- `navigate` can re-maximize; re-check `innerWidth` after every navigation.

## Driving — by ref, from the first click

`read_page` / `find` give element refs; use them for **every** click and type.
Screenshot pixels are not page coordinates (device pixel ratio, window scaling), so
a coordinate click lands off-target and typing goes into whatever has focus instead
— and the failure is silent: the form looks filled, the field is empty, and the
submit does nothing. In the measured run three interactions were lost that way
before switching, plus one on a modal caught mid-transition, whose coordinates were
stale by the time the click landed.

Two related ones, both cheap:

- **A screenshot can time out on an open modal** (`Page.captureScreenshot` after
  30s). That is a capture flake, not a frozen page — read the dialog's text with
  `javascript_tool` and carry on rather than retrying the screenshot.
- **Batch with `browser_batch`** whenever you can predict two steps ahead: click,
  type, Tab, assert. Each standalone call is a round trip.

## Camera-gated surfaces

The Check tab and the Add-Food scanner won't reach their interesting state without a
camera, and a denied camera *ends* the Check tab by design (ADR 0022). Faking one is
non-obvious — see **[camera-surfaces.md](camera-surfaces.md)**.

## Verdict

Emit something the reviewer can replay — what you drove, where, and what you saw:

```
## /verify — <feature/issue>

Stack: docker backend + pnpm dev; seeded <what>
Desktop (2133px): golden path ✅ — <the concrete figures/state observed>
Phone (555px):    golden path ✅ — bottom-tabs, no overflow, control reachable
Input probes: <the actual values driven, e.g. "Rolled" (capitalised) ✅ · "creme" → Crème fraîche ✅ · "   " ✅>
State probes: <empty state> ✅ · <error path> ✅

Verdict: PASS
```

**PASS** only if you saw it work at both viewports, and only with the input probes named
in the verdict — a walk-through that lists no probe values is a reachability pass wearing
the wrong label. **FAIL** stops the sign-off — fix and re-verify. **BLOCKED** (couldn't
reach the surface) is not a PASS; say what blocked you. If you fell back to Playwright,
label the verdict `PASS (Playwright fallback — claude-in-chrome unavailable)`.

Gate 0's verdict is one line: `reachability ✅ — <surface> loads and <the one action>
works at <width>`.

## Notes

- **Another project runs Nuxt on `:3210`.** Never `pkill -f "nuxt dev"` — match on
  `/proc/<pid>/cwd` containing `git/tucker` before killing anything.
- Console errors are worth a look, but `read_console_messages` only captures from when
  it's first called — call it *before* the interesting interaction, or reload.
- Don't trigger `alert`/`confirm` — a modal dialog freezes the extension for the rest
  of the session.

## Related

[`feature-sign-off`](../feature-sign-off/SKILL.md) (the gate that runs this first) ·
[`frontend-dev`](../frontend-dev/SKILL.md) · [`check-adrs`](../check-adrs/SKILL.md) ·
`frontend/DESIGN.md` for what the surface is *supposed* to look like.
