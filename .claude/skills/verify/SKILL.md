---
name: verify
description: The pre-PR runtime walk-through gate for Tucker — drive the real app in a real browser with the claude-in-chrome MCP tools, at both phone and desktop viewports, and emit a verdict a reviewer can replay. Use when a change is functionally complete and you need runtime evidence it actually works (gate 1 of feature-sign-off), when the user says "verify this", "walk it through", "does it actually work", or before opening a PR that touches a user-facing surface. This is runtime behaviour only — /code-review checks correctness and /check-adrs checks recorded decisions.
---

# Verify (Tucker)

**Gate 1 of [`feature-sign-off`](../feature-sign-off/SKILL.md).** Tests prove the code
does what you told it to; this proves the *app* does what the user needs. Automated
tests can't catch an overlapping toast, a broken responsive layout, a focus trap, or a
control that's unreachable one-handed — a walk-through can.

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
   vs FAB) — a single-viewport walk-through misses half the layout.
4. **Probe two edges** per viewport: the empty/zero state, the extreme value, the
   error path, the reset. Pick the ones your change could plausibly have broken.
5. **Emit the verdict** (below).
6. **Clean up**: stop the dev server you started and delete any scratch asset you
   dropped into the repo. Confirm with `git status --short`.

## Viewports — the part that bites

- `resize_window` **reports success even when nothing moved.** Always confirm with
  `javascript_tool` → `window.innerWidth`. Ignore `read_page`'s "Viewport:" line.
- **A maximized window silently refuses to resize** (no `wmctrl`/`xdotool` under
  Wayland). If two resize attempts don't move `innerWidth`, **ask the user to
  unmaximize the Chrome window** — one sentence, and the next resize works.
- **Chrome floors at ~555px wide**, so Pixel-7 width (412px) is unreachable. 555px is
  still under Tucker's 1024px breakpoint, so the phone layout *is* genuinely exercised
  — say which width you actually used. For a true 412px check, lean on the Playwright
  **Mobile Chrome** project.
- `navigate` can re-maximize; re-check `innerWidth` after every navigation.

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
Edge probes: <empty state> ✅ · <extreme value> ✅

Verdict: PASS
```

**PASS** only if you saw it work at both viewports. **FAIL** stops the sign-off — fix
and re-verify. **BLOCKED** (couldn't reach the surface) is not a PASS; say what blocked
you. If you fell back to Playwright, label the verdict
`PASS (Playwright fallback — claude-in-chrome unavailable)`.

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
