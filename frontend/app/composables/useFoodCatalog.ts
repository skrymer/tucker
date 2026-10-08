const CATALOG_KEY = 'food-catalog'

/**
 * The User's Food catalog: one keyed read that every surface showing it shares,
 * so a mutation re-reads it once, wherever it is on screen (ADR 0004).
 */
export function useFoodCatalog() {
  return useApi('/api/foods', { key: CATALOG_KEY })
}

/** Re-read the catalog for every surface showing it — after a catalog mutation lands. */
export function refreshFoodCatalog() {
  return refreshNuxtData(CATALOG_KEY)
}
