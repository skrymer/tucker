import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import { timelineDays, weightTimeline } from '~~/test/weight-timeline-fixtures'
import WeightTimelineBody from './WeightTimelineBody.vue'

describe('WeightTimelineBody', () => {
  it('states every day it draws in words, since the chart itself is decorative', async () => {
    await renderSuspended(WeightTimelineBody, {
      props: {
        timeline: weightTimeline({ days: timelineDays([80.4, null, 80.2]) }),
      },
    })

    expect(
      screen.getByText('1 Jun 2026 · 80.4 kg · trend 80.1 kg'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('2 Jun 2026 · no weigh-in · trend 80.1 kg'),
    ).toBeInTheDocument()
  })
})
