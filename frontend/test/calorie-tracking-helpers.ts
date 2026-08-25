import { defineComponent, h, type Component } from 'vue'
import { useCalorieTracking } from '~/composables/useCalorieTracking'

/**
 * A host that renders [component] with the app-wide Calorie Tracking setting
 * seeded through the real composable's own public `readFrom` — ADR 0013 mocks
 * only the true external boundary, and this one is Tucker's. No component loads
 * the setting itself; the app shell does, before the page paints.
 *
 * Every test states its own setting: the state is app-wide, so it carries over
 * between tests in a file and a pass could otherwise be the previous one's.
 */
export function withCalorieTracking(
  component: Component,
  tracksCalories: boolean,
  props: Record<string, unknown> = {},
) {
  return defineComponent({
    setup: () => useCalorieTracking().readFrom({ tracksCalories }),
    render: () => h(component, props),
  })
}
