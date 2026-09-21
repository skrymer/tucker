/**
 * A name as Tucker states it — sentence case, so a list reads one way whether its
 * rows were typed `rolled oats`, `Free Range Eggs` or `LIGHT MILK`.
 *
 * Only a token that cannot be prose survives as typed: anything carrying a digit
 * (`Bulla A2 milk`, `Greek yoghurt 4%`), and an initialism of three letters or
 * fewer — but an initialism only counts as one where it stands out against
 * lower-case neighbours. In a wholly shouted name nothing stands out, so
 * `UHT milk` keeps its initialism while `LOW FAT MILK` is calmed rather than
 * read as two of them. That costs the initialism in a name that was itself
 * shouted (`UHT MILK` → `Uht milk`), which is the cheaper of the two mistakes:
 * a half-calmed `LOW FAT milk` is the very thing this rule exists to stop.
 *
 * It also costs a longer initialism nobody writes (`BCAA powder`) and any
 * interior proper noun (`Plain GREEK yoghurt`); telling those apart needs a
 * dictionary.
 *
 * Display only. What a User typed stays stored, so this rule can change without a
 * migration, and the catalog's case-insensitive sort is unaffected either way.
 * It is **not** applied to a published name — a Reference Food's is stated as
 * FSANZ writes it (ADR 0027), where the qualifier carries the meaning.
 */
export function formatName(name: string): string {
  const words = name.trim().split(/(\s+)/)
  const shouted = words.every((word) => !hasLowercase(word))
  const stated = words
    .map((word) => (statedAsTyped(word, shouted) ? word : word.toLowerCase()))
    .join('')
  // The first *letter*, not the first character — nothing trims a Food name on
  // the way in and one can open on a quote or a bracket — but only where nothing
  // alphanumeric precedes it. Reaching past a figure would capitalise a unit
  // (`500g rolled oats`), and a label opening on a quantity is the common shape
  // of an Estimated Entry.
  return stated.replace(/^[^\p{L}\p{N}]*\p{L}/u, (opening) =>
    opening.toUpperCase(),
  )
}

/**
 * Whether a token is left exactly as typed. Decided per token rather than per
 * name, which is what makes the rule idempotent — a whole-name "is this shouted"
 * test flips its own answer once the first token has been capitalised, so
 * `b12 SUPPLEMENT` became `B12 SUPPLEMENT` and then `B12 supplement`. The one
 * thing the name as a whole decides is whether an initialism is distinguishable
 * at all.
 */
function statedAsTyped(word: string, shouted: boolean): boolean {
  if (/\d/.test(word)) return true
  if (shouted) return false
  const letters = word.replace(/\P{L}/gu, '')
  return (
    letters.length > 0 && letters.length <= 3 && word === word.toUpperCase()
  )
}

/** Whether a token carries a lower-case letter, and so is not itself shouting. */
function hasLowercase(word: string): boolean {
  return word !== word.toUpperCase()
}
