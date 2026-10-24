import { defineComponent, h, type Component } from 'vue'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'

/** Inside the app's root, as in the app, which provides what tooltips need. */
export function renderInApp(
  component: Component,
  props?: Record<string, unknown>,
) {
  return renderSuspended(
    defineComponent({ render: () => h(UApp, () => h(component, props)) }),
  )
}
