import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import WeightList from './WeightList.vue'

describe('WeightList', () => {
  it('renders the measurements newest first regardless of input order', async () => {
    await renderSuspended(WeightList, {
      props: {
        measurements: [
          { id: 1, measuredOn: '2026-05-20', weightKg: 85.0 },
          { id: 3, measuredOn: '2026-05-28', weightKg: 84.2 },
          { id: 2, measuredOn: '2026-05-24', weightKg: 84.6 },
        ],
      },
    })

    const dates = screen.getAllByRole('listitem').map((li) => li.textContent)

    expect(dates[0]).toContain('28 May 2026')
    expect(dates[1]).toContain('24 May 2026')
    expect(dates[2]).toContain('20 May 2026')
  })
})
