# Compute business logic in the backend, not the frontend

Tucker's rules — calorie and budget maths, the adaptive maintenance engine, and
derived states such as a day's verdict against the Calorie Budget and Protein
Floor (*on-target*, *over-budget*, or in-progress) — are business logic. The
backend domain model computes them and exposes the results through the REST API
as plain values. The frontend presents what the API returns and never re-derives
a rule.

A rule duplicated in the UI couples that rule to one specific frontend. The UI
should be swappable — a redesign, a native app, or a future WhatsApp adapter —
without any client reimplementing (and risking disagreement over) the same
calculations. Logic embedded in components also resists testing the core
deterministically and contradicts the rich domain model of
[ADR 0001](0001-domain-driven-design.md).

## Consequences

- Derived domain state is a field on the API response, not a frontend
  computation. `DailySummaryResponse` carries a `dayStatus` verdict; the
  dashboard renders it rather than comparing intake to the budget and floor.
- The frontend holds presentation logic only — formatting, layout, breakpoints,
  interaction and loading state. A component's computed value may depend on
  display concerns, never on domain rules.
- **A live, optimistic preview of not-yet-saved input may be computed on the
  client** — but only when the backend has no value to serve yet, and the
  **persisted** figure is still the backend's. The Day Ring's arc sweep
  (`ringFraction`) and the recipe builder's live "Per 100 g" (`rollupRecipe`,
  recomputed as ingredients change, before any POST) are previews of in-flight
  input; on save the backend recomputes the value authoritatively and that is
  what is stored — the client preview is never persisted. The invariant this
  keeps is that the backend is the single source of truth for every *saved*
  value; a transient preview it re-derives on write couples no durable rule to
  the UI. A preview must mirror the backend's formula (so the number doesn't
  jump on save) and must never be the value written back.
- A new derived value starts in the backend domain model and the OpenAPI
  contract, then flows to the regenerated client types — never the reverse.
- The deterministic core stays in one place and is tested there (see "The core
  is deterministic" in CLAUDE.md and the backend test suite).

## References

- [ADR 0001 — Domain-Driven Design with a rich domain model](0001-domain-driven-design.md)
- https://martinfowler.com/bliki/PresentationDomainDataLayering.html
