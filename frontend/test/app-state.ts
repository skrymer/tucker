import { defineComponent } from 'vue'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { clearNuxtState } from '#imports'

const resetHost = defineComponent({
  setup: () => {
    clearNuxtState()
    return {}
  },
  template: `<span>reset</span>`,
})

/**
 * Wipes the app-wide `useState` between tests. Without it a setting, an in-flight
 * read and a settled flag all survive into the next test, so a pass could be a
 * previous test's leftover and the order of the file would be load-bearing.
 */
export const forgetAppState = () => renderSuspended(resetHost)
