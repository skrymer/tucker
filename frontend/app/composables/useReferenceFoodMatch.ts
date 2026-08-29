/**
 * Claiming and taking back the borrow a **Food** makes of a **Reference Food**
 * (ADR 0027), for the two surfaces that own a picker: the match queue on
 * `/review` and the catalog on `/foods`.
 *
 * [food] is the picker's own open/closed state — non-null is open — and is
 * cleared when the server answers, never optimistically on the tap: until then
 * the coverage figure and the catalog subline behind it are still the old ones.
 * What differs per page is only what [onChanged] refreshes.
 */
export function useReferenceFoodMatch(
  food: Ref<{ id: number } | null>,
  onChanged: () => void | Promise<void>,
) {
  const { $api } = useNuxtApp()

  const settled = async () => {
    food.value = null
    await onChanged()
  }

  const { execute: claimFor } = useApiMutation(
    (target: { foodId: number; referenceFoodId: number }) =>
      $api('/api/foods/{id}/reference-food', {
        method: 'PUT',
        path: { id: target.foodId },
        body: { referenceFoodId: target.referenceFoodId },
      }),
    // No success toast on either page: the queue, the coverage figure and the
    // catalog subline all change where the User is already looking (ADR 0005).
    { errorTitle: 'Could not match this food', onSuccess: settled },
  )

  const { execute: clearFor } = useApiMutation(
    (foodId: number) =>
      $api('/api/foods/{id}/reference-food', {
        method: 'DELETE',
        path: { id: foodId },
      }),
    { errorTitle: 'Could not unmatch this food', onSuccess: settled },
  )

  /**
   * The Food is read once, at the tap, and travels as an argument — never off
   * [food] at request time. `useApiMutation`'s Retry replays the arguments of the
   * attempt that failed, so a Food read later would retry against whichever one
   * the picker happens to hold by then, or throw when it holds none.
   */
  const claim = (referenceFoodId: number) => {
    const target = food.value
    return target && claimFor({ foodId: target.id, referenceFoodId })
  }
  const clear = () => {
    const target = food.value
    return target && clearFor(target.id)
  }

  return { claim, clear }
}
