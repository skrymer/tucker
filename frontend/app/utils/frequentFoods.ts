/**
 * The window **Frequent Foods** are ranked over, and the only one there is: 30
 * days so a weekly staple clears four appearances while a Food dropped a month
 * ago falls out (CONTEXT.md). `FrequentFoods.rank` refuses every other span, so
 * this is the client's half of one rule rather than a preference.
 */
export const FREQUENT_FOODS_WINDOW_DAYS = 30
