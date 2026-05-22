# Follow Domain-Driven Design with a rich domain model

Tucker's domain carries real rules — calorie maths, recipe roll-ups, the adaptive
maintenance engine, goal and protein-floor derivation — so we follow Domain-Driven
Design: behaviour and invariants live in the domain objects themselves (entities,
value objects, aggregates), not in thin data classes manipulated by fat services.
The anemic domain model is explicitly rejected as an anti-pattern.

## Consequences

- Domain types enforce their own invariants (factory methods / `init` blocks) and
  expose behaviour — e.g. a `Food` computes the calories for a weight; a `Recipe`
  rolls its ingredients up into per-100g nutrition.
- Cross-aggregate logic lives in thin *domain services*; services orchestrate, they
  do not become the home of domain logic.
- The domain layer stays free of jOOQ and Spring annotations. Repositories map
  between jOOQ records and domain objects at the boundary.
- `CONTEXT.md` is the ubiquitous language; domain code uses exactly those terms.

## References

- https://martinfowler.com/bliki/DomainDrivenDesign.html
- https://martinfowler.com/bliki/AnemicDomainModel.html
