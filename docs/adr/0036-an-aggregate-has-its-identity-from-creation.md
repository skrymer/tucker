# An aggregate has its identity from the moment it is created

Every aggregate used to carry `val id: Long?`, with `null` meaning "not inserted
yet", because SQLite handed out the id on insert. A reader holding one it knew
came out of a repository still had to say so, with `id!!`, `checkNotNull(user.id)`
or `ApiSupport`'s `id ?: error(…)`. Turning on Detekt's type-resolved rules (#455)
made the bare `!!`s fail the build, and the ruling was to fix them in the model
rather than assert them away. Kotlin's order of preference applies: make null
impossible in the type; failing that, state the invariant with a message; never a
bare `!!`.

## The repository hands out the id before the aggregate is built

An Entity has its identity from creation (Evans; Vernon's *early identity*). A
factory takes the id as a plain `Long`, and a repository supplies it:

```kotlin
val goal = Goal.started(id = goals.nextId(), …)
goals.insert(goal)
```

So every aggregate has `id: Long`, a "stored or not" distinction never reaches the
domain, and the domain stays free of persistence: it receives a number, not a
generator.

`nextId()` reads a per-table row of an `id_sequence` table — incremented with
`UPDATE … RETURNING` in the caller's transaction, if any, and seeded past every id
the table has handed out: the larger of its `max(id)` and its `sqlite_sequence`
entry, since `AUTOINCREMENT` never reissued a deleted row's id — and the insert
writes the id explicitly. SQLite accepts an explicit value in an `INTEGER PRIMARY
KEY` column, `AUTOINCREMENT` or not, so no primary or foreign key changes, ids stay
`Long`, and the wire, the OpenAPI spec and the frontend do not move. An id taken and
then not used (a refused request, or an insert that lost a race to an existing row)
is a gap, which nothing reads. So is the id a weigh-in was built with when its day
is already weighed: it replaces that day's stored reading, which keeps its own id.

`id_sequence` belongs to no User: like `app_config`, it is the installation's, so it
is one of the tables ADR 0021's ownership rule leaves global.

An aggregate built only to be measured and never stored — the prospective Entry a
Budget Projection previews — is built with a fixed id, `0`, and draws none from the
sequence. Nothing reads that id, and no stored row can ever have it.

Two alternatives were rejected:

- **A draft type per aggregate** — `NewGoal` with no id, `Goal` with `id: Long`,
  `insert(NewGoal): Goal`. It removes the nulls too, and was the first ruling, but
  "not yet stored" is a persistence lifecycle state, not a domain one: the split
  leaks the database's id assignment into every aggregate as a second type.
- **UUIDs** — no round-trip for an id, but every id column, foreign key, DTO,
  OpenAPI type and frontend id would become a string, a migration of every table to
  buy what a sequence row already gives.

A jOOQ record's `rec.id!!` is not covered by this: it is a Java platform type over a
`NOT NULL` primary key, read only inside the repository mapping it.

Where nothing reads the surrogate id, the domain type drops it: a Push
Subscription's identity is its endpoint (it is claimed and deleted by endpoint), so
`PushSubscription` has no `id` and needs none handed out.

## A Recipe's cooked weight lives on its kind

**Pending:** decided with the rest of this record, delivered by #455's second PR.
Until then the code still has the enum and the two `!!`s below.

`Food` has `kind: FoodKind` next to a nullable `cookedWeightG`, with three
`require`s keeping them consistent and two readers writing `cookedWeightG!!`
after checking the kind. `FoodKind` becomes sealed instead: `Plain`, and
`Recipe(cookedWeightG: Double)`. The cooked weight exists only where it means
something (ADR 0019 slices a portion out of it), and a reader gets it by a
smart cast on the kind it has just matched. Making `Food` itself sealed
(`PlainFood` / `RecipeFood`) was rejected: two types for a fact that one field of
the kind can carry. The wire is unchanged; the DTO still states `kind` and
`cookedWeightG`.
