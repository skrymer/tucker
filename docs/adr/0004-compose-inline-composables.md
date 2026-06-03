# Compose inline composables

Tucker's Vue components accumulate reactive concerns — refs, computeds, watches,
and async load/save workflows. Left as a flat list in `<script setup>`, a page
like `/profile` grows to ~8 reactive declarations and three intertwined async
workflows in one block, where nothing signals which declaration serves which
concern. The reader has to re-derive the structure every time.

We adopt the **inline-composables** pattern: group each reactive concern into a
small, named `useXxx()` function so `<script setup>` reads as a thin assembly of
named concerns rather than a soup of primitives. A concern is defined **inline**
in the same `.vue` file when it is component-specific, and **extracted** to
`app/composables/` only once a second component needs it.

We considered the alternatives:

- **Flat `<script setup>`** — simplest, but unreadable past a few concerns and
  the source of the duplication this decision removes.
- **Always extract to `composables/`** — premature: most concerns have a single
  consumer, and extracting them adds a layer of indirection for no reuse.
- **Options API / mixins** — rejected; Tucker is Composition API + `<script
  setup>` throughout, and mixins reintroduce the implicit-source problem.

Inline-first, extract-on-reuse keeps related logic co-located until a real second
consumer justifies the move.

## Consequences

- A component's reactive concerns are grouped into named `useXxx()` composables;
  `<script setup>`'s top level reads as an assembly, e.g.
  `const { profile, save } = useProfileForm()`.
- Single-consumer concerns stay **inline** in the same `.vue` file (e.g.
  `useProfileForm`, `useGoalSubmission` in `/profile`). A concern is **extracted**
  to `app/composables/` only when a second component needs it — `useWeightLogging`
  was extracted because `/today` and `/profile` both log weight.
- Cross-cutting mutation boilerplate — re-entry guard, pending flag, failure
  toast, post-success side effects — lives in the shared `useApiMutation` factory;
  concern composables build on it rather than re-implementing it.
- **Extracted, shared** composables and utils get their own red-green unit tests
  (e.g. `useWeightLogging.test.ts`, `useApiMutation.test.ts`). **Inline**
  composables have no independent existence and are covered by their component's
  tests — if an inline composable needs its own test, that is the signal to
  extract it.
- Pure helpers with no reactivity are plain functions in `app/utils/` (e.g.
  `localToday`, `formatDateFromISO`), not composables.

## References

- <https://alexop.dev/posts/inline-vue-composables-refactoring/>
- Applied across the existing components in #30 (`profile`, `foods`, `index`,
  and the log-entry / weight / food sheets).
