import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import { http } from '~~/test/mocks/http'
import { server } from '~~/test/mocks/node'
import BuildTag from './BuildTag.vue'

describe('BuildTag', () => {
  it('renders the running build and flags a SHA split between frontend and backend', async () => {
    // The test build bakes the runtimeConfig defaults (frontend SHA "unknown");
    // the backend reports a different commit, so the tag labels both sides.
    server.use(
      http.get('/api/version', ({ response }) =>
        response(200).json({
          version: 'dev',
          gitSha: '9f8e7d6',
          builtAt: '2026-06-12T00:00:00Z',
        }),
      ),
    )
    await renderSuspended(BuildTag)

    expect(await screen.findByText(/fe unknown · be 9f8e7d6/)).toBeVisible()
  })
})
