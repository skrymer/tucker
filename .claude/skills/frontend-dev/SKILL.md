---
name: frontend-dev
description: The build-and-test workflow for the Tucker Nuxt frontend (Nuxt 4 + Nuxt UI 4, in frontend/). Use when building or changing ANY frontend functionality — a page, component, composable, util, or its tests. Sets the architecture rules, the four-layer test strategy, and the known gotchas, and routes to tdd, component-testing-best-practices, playwright-best-practices, and feature-sign-off for detail. This is the build workflow, NOT visual design — for look-and-feel use frontend-design and frontend/DESIGN.md.
---

# Frontend dev (Tucker)

The playbook for any change under `frontend/`. Read it first, build test-first, hand off to
`feature-sign-off` at the end. It **links** the canonical docs (ADRs, DESIGN.md, sibling skills) —
it does not restate them.

## Architecture rules (honour these; the links carry the why)

- **Present, don't compute.** Every derived number and domain verdict comes from the backend API;
  never re-derive a domain rule in Vue. Pure presentation helpers live in `app/utils/`
  (auto-imported); components render API values. (ADR 0002.)
- **Inline composables.** Group each reactive concern into a named `useXxx()` in the same `.vue`
  file; extract to `app/composables/` only on a second consumer. Cross-cutting mutation boilerplate
  lives in the shared `useApiMutation` factory. (ADR 0004.)
- **Forms validate with Zod.** Every `<UForm>` takes a Zod schema — the single source of truth for
  required fields, ranges, and messages, and its inferred type drives the form state. (ADR 0003.)
- **Notifications: persistent retryable errors, quiet success.** Failed mutations surface a
  persistent error toast + Retry (centralised in `useApiMutation`); success is quiet. (ADR 0005.)
- **Style through design tokens, never hex/class hacks.** Nuxt UI colour roles in `app.config.ts` +
  `--ui-*`/`@theme` tokens in `main.css`; colour is never the only signal (icon + text).
  (`frontend/DESIGN.md`.)
- **SPA, same-origin `/api`.** `ssr: false`; a nitro route proxies `/api/**` to the backend; fetch
  client-side via the generated `nuxt-open-fetch` client. After a controller change regenerate:
  `./gradlew generateOpenApiDocs` (in `backend/`) then `pnpm exec nuxt prepare`. (ADR 0015.)
- **The client owns "today".** Send the user's local date to endpoints that resolve a calendar day.
  (ADR 0014.)

## Test strategy — four layers, test-first

| Layer                       | Tool · env                                            | Where                     | Skill                             |
| --------------------------- | ----------------------------------------------------- | ------------------------- | --------------------------------- |
| Pure presentation helpers   | Vitest · env `nuxt`                                   | `app/utils/*.test.ts`     | **tdd**                           |
| Components                  | Vitest · `renderSuspended` + Testing Library          | co-located `*.test.ts`    | **component-testing-best-practices** |
| Rendered behaviour (mocked) | Playwright · Desktop + Mobile Pixel 7, `/api` mocked  | `e2e/*.spec.ts`           | **playwright-best-practices**     |
| Real-stack behaviour        | Playwright smokes vs the Docker backend               | `e2e/smoke/*.smoke.spec.ts` | **playwright-best-practices**   |

- One test at a time, RED first (the `tdd` skill). A **deep module** (an interface worth
  specifying) gets its own test; thin glue is covered by the integrated / smoke test — never call
  these "isolation tests". (ADR 0013.)
- Commands (run in `frontend/`): `pnpm test` · `test:e2e` · `test:smoke` · `lint` · `format`.

## Gotchas (each cost a CI / render failure once)

- **Auto-imports** — `app/utils/` + `app/composables/` auto-import; a util is addressed by export
  name, not path, so renaming the file is safe.
- **Vitest defaults to DESKTOP** (jsdom) — `useIsDesktop` reads `true`; drive phone-only branches
  with an explicit viewport override.
- **`UProgress`** — pass `:model-value` (not `:value`) and clamp it to `:max`; a wrong `:value` is
  silently ignored → an indeterminate bar. Its progressbar's accessible **name is the percentage**,
  so anchor e2e on visible text, not `getByRole('progressbar', { name })`.
- **Toast body has a hidden `aria-live` twin** — assert with `getByText(fullMessage, { exact: true })`.
- **Phone overlays are Reka Dialog bottom sheets** (ADR 0017), never Vaul `UDrawer`.
- **Per-project aria snapshots** (Desktop / Mobile) — after an intended markup change regenerate with
  `pnpm test:e2e --update-snapshots`, then `git diff` the `*-snapshots/` to confirm only the intended
  tree moved.
- **Stale Playwright build** — if a UI change doesn't show in an e2e/smoke run, `rm -rf frontend/.nuxt/test`.

## Exit

When the change works and is tested, run **`feature-sign-off`** (verify → simplify → code-review →
check-adrs) before committing.

## Related

`tdd` · `component-testing-best-practices` · `playwright-best-practices` · `feature-sign-off` ·
`frontend-design` (visuals only) + `frontend/DESIGN.md`. ADRs:
[0002](../../../docs/adr/0002-business-logic-belongs-in-the-backend.md) ·
[0003](../../../docs/adr/0003-validate-forms-with-zod.md) ·
[0004](../../../docs/adr/0004-compose-inline-composables.md) ·
[0005](../../../docs/adr/0005-notifications-persistent-errors-quiet-success.md) ·
[0013](../../../docs/adr/0013-test-coverage-policy.md) ·
[0014](../../../docs/adr/0014-client-owns-today.md) ·
[0015](../../../docs/adr/0015-production-deployment-topology.md) ·
[0017](../../../docs/adr/0017-phone-overlays-are-reka-dialog-bottom-sheets.md).
