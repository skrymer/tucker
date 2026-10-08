# A saved aggregate is its own type

Every aggregate used to carry `val id: Long?`, with `null` meaning "not inserted
yet". A reader holding one that it knew came out of a repository still had to say
so, with `id!!`, `checkNotNull(user.id)` or `ApiSupport`'s `id ?: error(…)`.
That repeated a rule the code could not state anywhere: once saved, an aggregate
has an id. Turning on Detekt's type-resolved rules (#455) made the bare `!!`s
fail the build, and the ruling was to fix them in the types instead of asserting
them away. Kotlin's order of preference applies: make null impossible in the
type; failing that, state the invariant with a message; never a bare `!!`.

## `NewX` is what creation builds, `X` is what a repository returns

Each aggregate splits in two: `NewFood` has no id and is what a factory or a
request builds, and `Food` has `id: Long` and is what a repository hands back.
`insert(NewFood): Food`. A function that needs a saved aggregate takes `Food`, so
"must be persisted first" is a parameter type instead of a `require`. The split
is the same for every aggregate with a database-assigned id, so the codebase has
one convention, not two. Where creation already takes a single value, that value
is the draft: a Tag is created from a `TagName`, so there is no `NewTag`, and
`Tag` simply has `id: Long`. And where nothing reads the surrogate id, the domain
type drops it: a Push Subscription's identity is its endpoint (it is claimed and
deleted by endpoint), so `PushSubscription` has no `id` and no draft type.

Two alternatives were rejected:

- **The id outside the entity** — `Stored<T>(id, value)`. It is one generic
  pattern, but every reader unwraps `.value`, and the aggregate no longer knows
  its own identity.
- **Ids assigned before insert** — a UUID or a domain-side sequence, so an id is
  never null. It changes the schema and every foreign key, a migration across all
  tables, to fix a problem the type system already solves.

A jOOQ record's `rec.id!!` is not covered by this: it is a Java platform type
over a `NOT NULL` primary key, read only inside the repository mapping it.

## `NewX` and `X` state their invariants once

Both types must hold the aggregate's invariants: a draft has to be valid before
it is inserted, and a saved aggregate's own transitions (`matchedTo`,
`retagged`, …) build copies that must stay valid. Each pair implements one sealed
interface, and the invariants are written once, as a function both `init`s call.
Readers keep `food.name`. Wrapping the draft inside the saved type (`food.details.name`)
and letting only the draft validate were both rejected: the first costs every
reader a hop, and the second lets a transition build an invalid copy unchecked.

## A Recipe's cooked weight lives on its kind

`Food` had `kind: FoodKind` next to a nullable `cookedWeightG`, with three
`require`s keeping them consistent and two readers writing `cookedWeightG!!`
after checking the kind. `FoodKind` is sealed instead: `Plain`, and
`Recipe(cookedWeightG: Double)`. The cooked weight exists only where it means
something (ADR 0019 slices a portion out of it), and a reader gets it by a
smart cast on the kind it has just matched. Making `Food` itself sealed
(`PlainFood` / `RecipeFood`) was rejected: combined with the draft split, it is
four types and an interface for a fact that one field of the kind can carry.
The wire is unchanged; the DTO still states `kind` and `cookedWeightG`.
