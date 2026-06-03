import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { registerEndpoint, renderSuspended } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/vue'
import { useWeightLogging } from './useWeightLogging'

let postedBody: Record<string, unknown> | undefined
registerEndpoint('/api/weight', {
  method: 'POST',
  handler: async (event) => {
    postedBody = await readBody(event)
    return {}
  },
})

// Drive the composable through a minimal host so it runs in a real component
// context (matching how the rest of the suite exercises composables).
const host = (options: Parameters<typeof useWeightLogging>[0]) =>
  defineComponent({
    setup() {
      const { logWeight } = useWeightLogging(options)
      return { log: () => logWeight({ date: '2026-06-01', weightKg: 84 }) }
    },
    template: `<button @click="log">log</button>`,
  })

describe('useWeightLogging', () => {
  it('posts the weight with the client local day as the validation anchor, then runs onSaved', async () => {
    postedBody = undefined
    const onSaved = vi.fn()
    await renderSuspended(host({ today: '2026-06-03', onSaved }))

    await userEvent.click(screen.getByRole('button', { name: 'log' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledOnce())

    expect(postedBody).toEqual({
      date: '2026-06-01',
      weightKg: 84,
      clientToday: '2026-06-03',
    })
  })
})
