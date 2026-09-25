---
name: verify
description: The runtime walk-through gate for Tucker — drive the real app in a real browser with the claude-in-chrome MCP tools, at both phone and desktop viewports, emit a verdict a reviewer can replay, and have that verdict audited against the diff by an agent. Runs twice in feature-sign-off: a one-viewport reachability pass before the other gates, and the full walk-through last, on the code that ships. Use when a change is functionally complete and you need runtime evidence it actually works, when the user says "verify this", "walk it through", "does it actually work", or before opening a PR that touches a user-facing surface. This is runtime behaviour only — /code-review checks correctness and /check-adrs checks recorded decisions.
---

# Verify (Tucker)

**Gates 0 and 6 of [`feature-sign-off`](../feature-sign-off/SKILL.md).** Tests prove the
code does what you told it to; this proves the *app* does what the user needs. Automated
tests can't catch an overlapping toast, a broken responsive layout, a focus trap, or a
control that's unreachable one-handed — a walk-through can.

## Two passes, because the code changes underneath you

This runs **twice**, and they are not the same run:

- **Reachability (gate 0)** — one viewport, the golden path, no edge probes. It answers
  "does the surface load and do the thing at all", so nobody reviews code that does not
  run. Two minutes. A FAIL here stops the sign-off before an agent is spawned.
- **The walk-through (gate 6)** — both viewports, the golden path *and* the input probes
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
   in `frontend/`. Wait for both before navigating. **Drive the URL the dev log's
   `➜ Local:` line names, not the port you asked for** — Nuxt silently moves to
   another port when yours is taken, so the one you asked for may still be answered
   by another worktree's server running other code. Confirm the listener is yours
   (`ss -ltnp | grep :<port>`, then `readlink /proc/<pid>/cwd`) before the first
   navigation.
   **A fresh worktree has no `frontend/.env`, so every `/api` call 401s** until the
   proxy has a dev assertion to attach: `printf 'TUCKER_DEV_ACCESS_TOKEN=%s\n'
   "$(node scripts/mint-dev-token.mjs --email verify-<slice>@tucker.invalid
   --expires-in 1d)" > .env` in `frontend/`. A fresh `--email` is a fresh User, so
   the walk-through never touches the developer's own dev data. **Delete the
   `.env` at cleanup** — it breaks the mocked e2e locally. And restart a dev server
   that has been running across the gates' fixes before the walk-through: one that
   had served the whole sign-off answered a 500 ("Cannot read properties of null")
   until restarted.
2. **Seed what the surface needs** over the API, not the UI — you're verifying
   *your* change, not re-testing setup. Go **through the dev proxy**
   (`http://localhost:<port>/api`), not `:8080`, which demands an Access assertion
   `curl` does not carry; and a mutation needs the CSRF pair (ADR 0025): GET any
   `/api` path into a cookie jar, then send the `XSRF-TOKEN` cookie's value back as
   the `X-XSRF-TOKEN` header. Most screens need a Calorie Budget, which needs
   profile + weight + goal; check first with `/api/summary?date=<today>`.
3. **Walk the golden path** at **desktop**, then **repeat at phone width**. Tucker has a
   real responsive split (side-nav vs bottom-tabs, modal vs bottom sheet, header button
   vs FAB) — a single-viewport walk-through misses half the layout. (Gate 0 stops here,
   at one viewport.)
4. **Probe the input space, then the states.** See below — this is the step that earns
   the gate, and the one most easily reduced to nothing.
5. **Emit the verdict** (below).
6. **Audit the verdict** — walk-through pass only. See below.
7. **Clean up**: stop the dev server you started and delete any scratch asset you
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
| A capped, trimmed name | the cap and cap+1 **padded with spaces**, the cap counted in UTF-16 (16 × 😀 is 32 units), a character the two sides trim differently, **both ways** — `"\u001F"` (JS keeps it, Kotlin's `trim()` strips it) and `"﻿"` (JS strips it, Kotlin keeps it) — driven alone *and* in front of a real value (`"\u001FSnack"`) through **every** client-side decision the name feeds (a duplicate check, a merge preview), not only the server's refusal: F18 slice 6 drove `"\u001F"` to the blank refusal alone, and the untested branch was an unannounced merge |
| A number | zero, the boundary of its rule, one past it, a decimal where an integer is expected |
| A list | none, one, the cap, one past the cap |
| A date | today, a local midnight, a day the rule spans |
| A new request-body field | read the saved record back through the API after the save, since a form can look right and send nothing (`GET /api/foods` showing the new `tags`, not the chips on screen) |

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

- `resize_window` **reports success even when nothing moved.** Judge the viewport
  from the **screenshot's layout** (bottom tabs vs side nav), not from `innerWidth`:
  it has misreported in both directions. Ignore `read_page`'s "Viewport:" line.
- **Stop after two failed resizes.** Un-maximizing has not always been enough: on
  F18 slice 3 the window stayed at desktop width through three attempts, the last
  after the user had un-maximized it. Past that point, fall back to the Playwright
  **Mobile Chrome** project and label the verdict so, rather than stalling the gate.
  Issue #379 is about replacing this driver.
- **A maximized window silently refuses to resize** (no `wmctrl`/`xdotool` under
  Wayland). If two resize attempts don't move `innerWidth`, first open a **fresh tab**
  with `tabs_create_mcp` and resize that to 412×915 — one session reports it landing
  first time (not yet re-confirmed). Only if that fails too, **ask the user to
  unmaximize the Chrome window** — one sentence, and the next resize works.
- **Ask before the desktop pass, not after it.** The resize only fails at the
  *phone* step, which is halfway through the gate, so the question lands after the
  stack is up and the desktop walk is done — and then everything waits on a human.
  One `resize_window` + `innerWidth` check at the very start costs one tool call
  and moves the question to a moment where the user can answer it while you seed
  data.
- **An un-maximized window floors at ~555px wide** (586px measured on another run), so
  Pixel-7 width (412px) is unreachable that way — the fresh tab above is the one route
  reported to reach it. The floor is
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

Related, all cheap:

- **`find` can return refs into a closed sheet.** A sheet that has closed can leave
  its hidden inputs in the tree, and `find` will hand those back. Scope the query to
  the open dialog by name, and check the state after each click: a ref click can
  report success without landing. When it does, a DOM `.click()` through
  `javascript_tool` gets through.
- **A screenshot can time out on an open modal** (`Page.captureScreenshot` after
  30s). That is a capture flake, not a frozen page — read the dialog's text with
  `javascript_tool` and carry on rather than retrying the screenshot.
- **Batch with `browser_batch`** whenever you can predict two steps ahead: click,
  type, Tab, assert. Each standalone call is a round trip.
- **Typing can stop landing too**, silently: the field has focus, the tool reports the
  keys, the value stays empty — seen once the window lost OS focus, alongside a sheet
  stuck in `data-state="closed"` (its exit animation never ran). Check the value after
  every type. Setting it through the native setter plus an `input` event drives v-model,
  but it is **not typed entry** — it skips the keystroke and blur timing where F18 slice 5's
  bug lived. Label such probes in the verdict, and drive the golden path and one boundary
  with real keystrokes (or Playwright `pressSequentially`).

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
the wrong label. A probe named without its value is not a probe. **FAIL** stops the sign-off — fix and re-verify. **BLOCKED** (couldn't
reach the surface) is not a PASS; say what blocked you. If you fell back to Playwright,
label the verdict `PASS (Playwright fallback — claude-in-chrome unavailable)`.

Gate 0's verdict is one line: `reachability ✅ — <surface> loads and <the one action>
works at <width>`.

## Auditing the verdict — the prober is also the scorer

You choose which probes to drive and then write the verdict that says they were
enough. Nothing in that loop checks the verdict **against the diff** — whether the
values you drove reach the inputs the change accepts.

So the walk-through pass ends by handing one agent the verdict verbatim and the diff,
and asking exactly one question: do these probes cover the inputs this change accepts,
at their boundaries? The brief is **Brief C** in
[`feature-sign-off/references/agent-briefs.md`](../feature-sign-off/references/agent-briefs.md).
It drives no browser and re-verifies nothing — it enumerates the inputs from the diff
and checks each against a concrete value in the verdict.

- **UNCOVERED or WEAK sends you back into the browser**, not into a justification.
  Drive the values it names, then extend the verdict.
- **The reachability pass is exempt** — it has no probes to audit.
- Append the result to the verdict, so a reviewer sees what was checked:
  `verdict audit: 4 inputs — 3 COVERED, 1 UNCOVERED (start date = today) → drove it ✅`

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
