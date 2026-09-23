// PROTOTYPE — throwaway. Answers: "what does picking a Tag do to /log?"
// In-memory demo catalog; nothing here is persisted or sent to the backend.
// Delete with the rest of components/prototype/ once a variant is chosen.

import { reactive } from 'vue'

export interface DemoFood {
  id: number
  name: string
  kind: 'FOOD' | 'RECIPE'
  caloriesPer100g: number
  proteinPer100g: number
  /** Entries naming it in the trailing 30 days — what Frequent Foods ranks by. */
  count30d: number
  tags: string[]
}

type Row = [string, number, number, number, string[], ('RECIPE' | undefined)?]

const rows: Row[] = [
  ['Rolled oats', 379, 13, 28, ['breakfast']],
  ['Greek yoghurt, plain', 97, 10, 26, ['breakfast', 'snack']],
  ['Blueberries', 57, 0.7, 14, ['breakfast', 'snack']],
  ['Banana', 89, 1.1, 19, ['breakfast', 'snack']],
  ['Whole milk', 64, 3.3, 30, ['breakfast']],
  ['Eggs', 143, 12.6, 12, ['breakfast']],
  ['Sourdough bread', 260, 9, 16, ['breakfast', 'lunch']],
  ['Peanut butter', 588, 25, 9, ['breakfast', 'snack']],
  ['Honey', 304, 0.3, 6, ['breakfast']],
  ['Whey protein', 400, 80, 18, ['post-workout']],
  ['Chicken breast', 165, 31, 22, ['dinner', 'lunch']],
  ['Basmati rice, cooked', 130, 2.7, 20, ['dinner', 'lunch']],
  ['Broccoli', 34, 2.8, 11, ['dinner']],
  ['Olive oil', 884, 0, 27, []],
  ['Weekday chilli', 118, 9.5, 7, ['dinner'], 'RECIPE'],
  ['Salmon fillet', 208, 20, 4, ['dinner']],
  ['Sweet potato', 86, 1.6, 6, ['dinner']],
  ['Tuna, tinned in springwater', 116, 26, 8, ['lunch']],
  ['Mixed salad leaves', 17, 1.4, 9, ['lunch']],
  ['Feta', 264, 14, 5, ['lunch']],
  ['Apple', 52, 0.3, 11, ['snack']],
  ['Almonds', 579, 21, 7, ['snack']],
  ['Dark chocolate 70%', 598, 7.8, 5, ['snack']],
  ['Rice cakes', 387, 8, 3, ['snack']],
  ['Cottage cheese', 98, 11, 6, ['snack', 'post-workout']],
  ['Overnight oats', 165, 8, 4, ['breakfast'], 'RECIPE'],
  ['Granola', 471, 10, 1, ['breakfast']],
  ['Crumpets', 200, 6, 0, ['breakfast']],
  ['Beef mince, 5% fat', 137, 21, 3, ['dinner']],
  ['Pasta, cooked', 158, 5.8, 5, ['dinner']],
  ['Tomato passata', 29, 1.4, 5, ['dinner']],
  ['Cheddar', 403, 25, 4, ['lunch', 'snack']],
  ['Hummus', 166, 7.9, 2, ['lunch', 'snack']],
  ['Crème fraîche', 292, 2.4, 1, ['dinner']],
  ['Butter', 717, 0.9, 8, []],
]

export const demoFoods: DemoFood[] = reactive(
  rows.map(([name, kcal, protein, count30d, tags, kind], i) => ({
    id: 9000 + i,
    name,
    kind: kind ?? 'FOOD',
    caloriesPer100g: kcal,
    proteinPer100g: protein,
    count30d,
    tags,
  })),
)

/** Every Tag in use, alphabetically — found by name, not by rank. */
export function demoTags(foods: DemoFood[]): string[] {
  return [...new Set(foods.flatMap((f) => f.tags))].sort((x, y) =>
    x.localeCompare(y),
  )
}

/** Frequent Foods over a subset: count desc, cap ten — what the backend would do. */
export function rankFrequent(foods: DemoFood[], cap = 10): DemoFood[] {
  return foods
    .filter((f) => f.count30d > 0)
    .sort((a, b) => b.count30d - a.count30d)
    .slice(0, cap)
}

export function alphabetical(foods: DemoFood[]): DemoFood[] {
  return [...foods].sort((a, b) => a.name.localeCompare(b.name))
}

const extraTags = [
  'high-protein',
  'quick',
  'work',
  'weekend',
  'kids',
  'pantry',
  'fridge',
  'pre-workout',
  'cheat day',
  'travel',
  'meal prep',
  'dessert',
  'drinks',
  'low-carb',
  'takeaway-swap',
  'late night',
]

/** The same catalog with sixteen more Tags spread across it — a heavy tagger. */
export function withManyTags(foods: DemoFood[]): DemoFood[] {
  return foods.map((f, i) => ({
    ...f,
    tags: [
      ...f.tags,
      extraTags[i % extraTags.length]!,
      ...(i % 3 === 0 ? [extraTags[(i * 7) % extraTags.length]!] : []),
      // every fifth Food is a heavy tagger's favourite: five more
      ...(i % 5 === 0 ? extraTags.slice(i % 8, (i % 8) + 5) : []),
    ].filter((t, j, a) => a.indexOf(t) === j),
  }))
}

/** Case-insensitive: an existing Tag's spelling wins over what was typed. */
export function canonicalTag(typed: string, known: string[]): string | null {
  const t = typed.trim()
  if (!t) return null
  return known.find((k) => k.toLowerCase() === t.toLowerCase()) ?? t
}

export function addDemoFood(food: Omit<DemoFood, 'id' | 'count30d'>) {
  demoFoods.push({ ...food, id: 9000 + demoFoods.length, count30d: 0 })
}
