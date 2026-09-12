import type { components } from '#open-fetch-schemas/api'

type EntryResponse = components['schemas']['EntryResponse']

/**
 * The name the backend gives a weighed Entry whose Food it could not resolve
 * (`EntryController.UNRESOLVED_FOOD_NAME`). Mirrored here so a fixture built
 * without a `foodName` carries the name the wire would.
 */
const UNRESOLVED_FOOD_NAME = 'Unknown food'

/**
 * A Weighed Entry as the API sends it — a Food, weighed in grams.
 *
 * There are two factories rather than one with a `kind` argument because an
 * Entry's shape *is* its kind. The schema spells the invariant out
 * (`V1__initial_schema.sql:51-52`): a weighed Entry has a `foodId` and `grams`
 * and no `label`; an estimated one has a `label` and none of the other three.
 * A single factory taking `kind` would still let a caller pair the wrong
 * fields; two make the pairing structural, the same way `food()` / `recipe()`
 * split in `food-fixtures.ts`.
 *
 * `kind`, `isEstimate` and `label` are set here, not accepted, for the same
 * reason. `kind` and `isEstimate` are two spellings of one fact and
 * `EntryController.toResponse` writes them together, so a disagreeing pair is
 * unrepresentable in production — and should be unwritable here.
 *
 * `protein` is required alongside `foodId` even though the wire types it
 * nullable, because protein is computed from the Food and so a weighed Entry
 * always carries a figure. `foodName` stays nullable, matching the wire: the
 * server sends `null` for a Food it could not resolve a name for.
 *
 * `name` is derived rather than accepted, for the same reason as `kind`: the
 * backend states it (`EntryController.toResponse`) from the Food's name, falling
 * back when there is none, so a fixture that let a caller set it independently
 * could build an Entry named one thing and shown as another — a row the wire
 * cannot produce.
 *
 * Absent fields default to `null` rather than being left out, because that is
 * what the wire carries — Tucker serializes an absent value as an explicit
 * `null` (ADR 0023). `loggedOn` is defaulted because nothing in the frontend
 * reads it; the figures are the caller's to state.
 *
 * The return is `Required<EntryResponse>`, not `EntryResponse`, and that is what
 * makes this a single point of change rather than a smaller pile of them: every
 * nullable field is *optional* in the generated type, so a plain `EntryResponse`
 * return would let a newly added field go missing here in silence. Requiring
 * every key means the day one lands, `pnpm typecheck` fails on this file and
 * names it.
 *
 * Defaults come before the spread, so a caller's partial wins; the fixed fields
 * come after, so it can't.
 */
export function weighedEntry(
  partial: Omit<
    Partial<EntryResponse>,
    'kind' | 'isEstimate' | 'label' | 'name'
  > & {
    id: number
    calories: number
    protein: number
    foodId: number
    foodName: string | null
    grams: number
  },
): Required<EntryResponse> {
  return {
    loggedOn: '2026-05-22',
    ...partial,
    kind: 'WEIGHED',
    isEstimate: false,
    label: null,
    name: partial.foodName ?? UNRESOLVED_FOOD_NAME,
  }
}

/**
 * An Estimated Entry as the API sends it — a user-typed label and a calorie
 * guess, with no Food behind it (a restaurant meal, something eaten on the go).
 *
 * The mirror of {@link weighedEntry}: `label` is required, and `foodId`,
 * `foodName` and `grams` are nulled here rather than accepted, so the arm can't
 * be built holding a Food it does not have. `name` is the label trimmed, which
 * is what the backend sends for this arm.
 */
export function estimatedEntry(
  partial: Omit<
    Partial<EntryResponse>,
    'kind' | 'isEstimate' | 'foodId' | 'foodName' | 'grams' | 'name'
  > & {
    id: number
    calories: number
    label: string
  },
): Required<EntryResponse> {
  return {
    loggedOn: '2026-05-22',
    protein: null,
    ...partial,
    kind: 'ESTIMATED',
    isEstimate: true,
    foodId: null,
    foodName: null,
    grams: null,
    name: partial.label.trim(),
  }
}
