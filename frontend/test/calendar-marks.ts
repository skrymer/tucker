import { within } from '@testing-library/vue'

/**
 * The calendar days carrying [mark], by their accessible names. A mark is purely
 * visual, so it has no accessible form to query by.
 */
export function markedDays(
  mark: 'weight' | 'entries',
  container: HTMLElement = document.body,
) {
  return within(container)
    .getAllByRole('button', { name: /^\w+day, / })
    .filter((day) => day.querySelector(`[data-mark="${mark}"]`))
    .map((day) => day.getAttribute('aria-label'))
}
