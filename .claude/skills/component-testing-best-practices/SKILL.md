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

1. `getByRole` with `{ name }` — buttons, headings, inputs, links, regions
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
- Never assert on CSS classes, DOM structure, `wrapper.vm`, or emitted internals.
- After writing tests, run `pnpm test` and only proceed when green.

## Anti-patterns

| Avoid                                                   | Use instead                                  |
| ------------------------------------------------------- | -------------------------------------------- |
| `getByTestId` for something with a role or visible text | `getByRole` / `getByText`                    |
| `fireEvent.click(el)`                                   | `await user.click(el)`                       |
| Asserting on classes or element structure               | Assert on visible text, roles, state         |
| `@vue/test-utils` low-level APIs (`find`, `.vm`)         | Testing Library queries                      |
| Snapshot tests of rendered markup                       | Explicit behavioural assertions              |
