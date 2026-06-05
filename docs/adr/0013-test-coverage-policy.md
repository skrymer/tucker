# Test coverage policy: spec deep modules, drive glue through the slice

Tucker is built strictly test-first (the `/tdd` skill: red→green, one test per
cycle, vertical tracer bullets). That settles *how* we write tests, but a question
kept recurring per feature: **which units get their own test, and which are left to
a higher-level test?** Answering it ad-hoc risks two failures — over-testing thin
glue with mock-heavy tests (the exact "bad test" `/tdd` warns against), or
under-testing genuine logic. This ADR records the standing answer so the decision
is mechanical, and so it stays *inside* the `/tdd` rule rather than competing with
it.

## Decision

A module earns its **own** test when it has a **public interface worth specifying**
— i.e. it is a **deep module** (small interface, deep implementation): domain value
objects, pure decision functions, the adaptive engine, shared composables and
utils. The test exercises the module's *real* implementation through that interface,
which is integration-style by `/tdd`'s definition — **not** mock-isolation.

**Thin glue gets no separate test.** A controller that only delegates, scheduler
wiring, a component that only assembles children — these have no public interface of
their own to specify, and a standalone test would have to mock internal
collaborators (the bad-test smell). Their behaviour is driven and observed through
an **integrated** test one level out: a component test, or the slice's real-stack
smoke.

The dividing line is **"is there an interface worth specifying as a spec?"** — not
"logic vs. plumbing get tested or not." *Everything* is still built test-first;
glue's failing red simply lives in the integrated test, not in a unit test.

### The rules, concretely

1. **Test behaviour through public interfaces; mock only the *true external
   boundary*** — the network (`$api`/HTTP), the web-push transport, the browser
   event source (`beforeinstallprompt`, `PushManager`). **Never mock internal
   collaborators.**
2. **Deep modules get their own behaviour test.** Their interface is a spec; running
   the real implementation through it is integration-style, needs no internal mocks.
3. **Glue is driven by the integrated test**, not a standalone one.
4. **Every vertical slice ships one real-stack smoke** (`pnpm test:smoke` against the
   live backend container) — the end-to-end golden path, no API mocks.
5. **New shared composables and utils get their own red-green tests.**
6. **Tests are named by behaviour, never by implementation or issue number.**

### The test layers this produces

- **Deep-module tests** — backend domain/decision units (e.g. a pure
  `shouldRemind(state)` function); frontend composables/utils via Vitest. Real
  implementation, public interface, no internal mocks.
- **Component tests** — Testing Library via `renderSuspended`, real child components,
  only the network mocked (see the component-testing-best-practices skill).
- **Mocked Playwright e2e** — `page.route`-mocked API, Desktop + Mobile Chrome, for
  responsive/interaction behaviour (see the playwright-best-practices skill).
- **Real-stack smoke (e2e)** — Playwright against the live backend container, per
  slice, no mocks.
- **Backend integration / Testcontainers e2e** — Spring context + real SQLite, for
  controllers, repositories, and wiring (the glue's home).

## Worked example (F6)

`ReminderPolicy`, `VapidKeyStore`, `usePwaInstall`, `useWebPush` are deep modules
(each a small interface over real branching/logic) → each gets its own behaviour
test. `ReminderScheduler` and the push controller are glue → no separate test; their
behaviour is observed through the reminder slice's real-stack smoke and backend
integration test.

## Alternatives rejected

- **A unit test for every class/function** — produces mock-heavy tests coupled to
  internal structure that break on refactor without a behaviour change; the precise
  anti-pattern `/tdd` calls out.
- **Only end-to-end / smoke tests** — slow, and they pin deep logic (adaptive math,
  the reminder decision) too coarsely to drive it test-first or localise a failure.

## Consequences

- The recurring "does this get its own test?" question has a mechanical answer:
  deep module → yes; glue → covered by the integrated test.
- It actively *reinforces* `/tdd` — same red-green discipline, same "behaviour
  through public interfaces, minimal mocking" rule; this ADR only fixes *where* each
  behaviour's red lives.
- Designing for testability means **finding deep modules** (small interface, deep
  implementation) — the same pressure `/tdd`'s refactor step already applies.

## References

- `/tdd` skill — red-green discipline, "behaviour through public interfaces," the
  internal-mocking anti-pattern, deep modules.
- component-testing-best-practices skill — the component-test layer.
- playwright-best-practices skill — the e2e / smoke layers.
- [`CLAUDE.md`](../../CLAUDE.md) — the test commands and the per-slice
  vertical-with-smoke convention.
- [0004 — compose inline composables](0004-compose-inline-composables.md) — extracted
  shared composables get their own tests; inline ones are covered by the component's.
</content>
