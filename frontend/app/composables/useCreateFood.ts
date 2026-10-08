import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

/**
 * Adding a Food to the catalog. [landed] is handed the save as it is issued, so
 * a caller can act on the Food it creates — or on the moment it was asked for.
 * Every surface showing the catalog re-reads it once the Food lands.
 */
export function useCreateFood(
  landed: (save: Promise<FoodResponse>) => Promise<unknown>,
) {
  const { $api } = useNuxtApp()
  return useApiMutation(
    (payload: components['schemas']['CreateFoodRequest']) =>
      landed($api('/api/foods', { method: 'POST', body: payload })),
    { errorTitle: 'Could not add food', onSuccess: refreshFoodCatalog },
  )
}
