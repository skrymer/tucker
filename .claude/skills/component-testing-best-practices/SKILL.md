---
name: component-testing-best-practices
description: Vue component / unit testing conventions for the Tucker frontend — Testing Library (@testing-library/vue + @testing-library/user-event) rendered through @nuxt/test-utils' renderSuspended, following the Testing Library guiding principles. Use when writing or editing Vue component or unit tests (frontend/**/*.test.ts), or when deciding how to query, render, or interact with a component under test.
---

# Component Testing Best Practices

Vitest component / unit tests for the Nuxt frontend. Browser end-to-end tests
are a separate concern — use the `playwright-best-practices` skill for those.

## Guiding principle

> The more your tests resemble the way your software is used, the more
> confidence they can give you.
> — <https://testing-library.com/docs/guiding-principles>

Test observable behaviour through the accessibility tree, never implementation
details. A good test survives any refactor that doesn't change what the user
sees or does.

## Quick start

```ts
import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import DaySummary from './DaySummary.vue'

describe('DaySummary', () => {
  it('shows calories consumed against the budget', async () => {
    await renderSuspended(DaySummary, { props: { summary } })

    expect(screen.getByText('1500 / 2000 kcal')).toBeVisible()
  })
})
```

- `renderSuspended` (from `@nuxt/test-utils/runtime`) renders with full Nuxt
  context — auto-imports, `NuxtLink`, Nuxt UI, `#imports`. Use it, not
  `@testing-library/vue`'s bare `render`.
- `jest-dom` matchers (`toBeVisible`, `toHaveTextContent`, `toBeDisabled`, …)
  are registered globally in `test/setup.ts`.

## Query priority

Find elements the way a user or assistive technology would. Prefer, in order:

1. `getByRole` with `{ name }` — buttons, headings, inputs, links, regions. happy-dom
   names some roles a browser does not: a `<dl>`'s `<dd>` (`definition`) has no
   accessible name in Chrome, so a `{ name }` query on it passes here and fails in
   Playwright — #523's tiles became tables (`row` is named by its cells in both)
2. `getByLabelText` / `getByPlaceholderText` — form fields
3. `getByText` — non-interactive content
4. `getByTestId` — last resort, only when nothing above can address the element

`getBy*` throws when absent; `queryBy*` returns `null` (use for "is not there"
assertions); `findBy*` is async (use to wait for something to appear). Scope to
a region with `within(...)` rather than reaching for test ids.

## Interactions

Drive interaction with `@testing-library/user-event`, never `fireEvent` — it
reproduces real user behaviour (focus, key sequences, pointer events). Call
`userEvent.setup()` once per test and `await` every interaction.

## Conventions

- Co-locate: `Foo.vue` → `Foo.test.ts` in the same directory.
- One behaviour per test; the test name reads as a capability.
- Assert on what the user perceives — visible text, roles, accessible state.
- For mutually-exclusive states, also assert the alternatives are absent
  (`queryBy*` + `.not.toBeInTheDocument()`) — a positive-only check still passes
  if a regression renders two states at once.
- **Pin a time threshold on both sides**: at n − 1 it has not fired, at n it has. "Gave
  up by 8 s" alone passes a 3 s timeout (#433). For a timer started at mount, fake only
  `setTimeout`/`clearTimeout` before rendering and advance them by hand — not
  `shouldAdvanceTime`, which leaks render time into the clock and flaked under suite load.
- **A "did not happen" assertion is only as late as the reaction it waits for.** When a
  change defers a reaction — a timer, a debounce, a `nextTick` — every test asserting
  that reaction did *not* happen must now let it run (`vi.useFakeTimers()` +
  `vi.runAllTimers()`) before asserting, or it passes whatever the code does. #435
  deferred a stop by 250 ms and its "stops listening once its surface is gone" test
  went silently vacuous; re-audit those tests in the same change. The same goes for a
  read taken **out of awaited setup** (`void load()`): `renderSuspended` now returns
  before the answer, so every test asserting straight after render — positive ones
  included — checks the unanswered state. Make each wait for text only the answer
  renders (#475's "opens on today" passed with the read broken, and its busy test
  passed only because the click aborted the unanswered first read).
- Never assert on CSS classes, DOM structure, `wrapper.vm`, or emitted internals.
- A toast never renders under `renderSuspended`, which mounts no toaster. Mock
  `useToast` with `mockNuxtImport` and assert what `add` is handed — the title and
  description are the words the User reads (`app/pages/log.test.ts`).
- **`rerender({...})` re-runs a prop watcher even when the prop is the same
  object**, so state a `watch` resets on open (a sheet's chosen day) is reset by
  the rerender, not by anything a User did. Put the state under test into the first
  render instead (#443).
- **A sheet's autofocus takes back a `.focus()` set during the render.** To start a
  keyboard test on a control inside an overlay, `await user.click()` it.
- After writing tests, run `pnpm test` and only proceed when green.

## Anti-patterns

| Avoid                                                   | Use instead                                  |
| ------------------------------------------------------- | -------------------------------------------- |
| `getByTestId` for something with a role or visible text | `getByRole` / `getByText`                    |
| `fireEvent.click(el)`                                   | `await user.click(el)`                       |
| Asserting on classes or element structure               | Assert on visible text, roles, state         |
| `@vue/test-utils` low-level APIs (`find`, `.vm`)         | Testing Library queries                      |
| Snapshot tests of rendered markup                       | Explicit behavioural assertions              |
