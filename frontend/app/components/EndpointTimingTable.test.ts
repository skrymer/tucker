import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/vue'
import { renderInApp } from '~~/test/render-in-app'
import EndpointTimingTable from './EndpointTimingTable.vue'

/** One timed endpoint, the slowest at [p95Ms]. */
const slowest = (p95Ms: number) => [
  {
    method: 'GET',
    uri: '/api/summary',
    count: 40,
    serverErrors: 0,
    p50Ms: 1,
    p95Ms,
  },
]

// Where each label sits on the chart is layout, which happy-dom cannot compute;
// e2e/admin-server.spec.ts measures it.
describe('EndpointTimingTable', () => {
  it.each([
    [37, ['0 ms', '10 ms', '20 ms', '30 ms', '40 ms']],
    [50, ['0 ms', '10 ms', '20 ms', '30 ms', '40 ms', '50 ms']],
    [190, ['0 ms', '50 ms', '100 ms', '150 ms', '200 ms']],
    [200, ['0 ms', '50 ms', '100 ms', '150 ms', '200 ms']],
    [412, ['0 ms', '100 ms', '200 ms', '300 ms', '400 ms', '500 ms']],
  ])(
    'labels the shared axis in round steps past a slowest p95 of %i ms, six labels at most',
    async (p95Ms, labels) => {
      await renderInApp(EndpointTimingTable, { endpoints: slowest(p95Ms) })

      const axis = screen.getByRole('columnheader', { name: 'p50 to p95' })
      expect(
        within(axis)
          .getAllByText(/^\d+ ms$/)
          .map((label) => label.textContent?.trim()),
      ).toEqual(labels)
    },
  )
})
