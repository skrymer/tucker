import type { components } from '#open-fetch-schemas/api'

type EntryResponse = components['schemas']['EntryResponse']

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
 * `foodName` is required alongside `foodId` even though the wire types it
 * nullable: nothing renders a weighed Entry without naming it (`formatEntryName`
 * would print the string "null"), and deleting a Food an Entry references is
 * refused, so the null arm belongs to no flow a test currently has. Widen it
 * when one appears.
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
  partial: Omit<Partial<EntryResponse>, 'kind' | 'isEstimate' | 'label'> & {
    id: number
    calories: number
    foodId: number
    foodName: string
    grams: number
  },
): Required<EntryResponse> {
  return {
    loggedOn: '2026-05-22',
    protein: null,
    ...partial,
    kind: 'WEIGHED',
    isEstimate: false,
    label: null,
  }
}

/**
 * An Estimated Entry as the API sends it — a user-typed label and a calorie
 * guess, with no Food behind it (a restaurant meal, something eaten on the go).
 *
 * The mirror of {@link weighedEntry}: `label` is required, and `foodId`,
 * `foodName` and `grams` are nulled here rather than accepted, so the arm can't
 * be built holding a Food it does not have.
 */
export function estimatedEntry(
  partial: Omit<
    Partial<EntryResponse>,
    'kind' | 'isEstimate' | 'foodId' | 'foodName' | 'grams'
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
  }
}
