import { describe, expect, it } from 'vitest'
import { renderSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import BuildTag from './BuildTag.vue'

describe('BuildTag', () => {
  it('renders the running build and flags a SHA split between frontend and backend', async () => {
    // The test build bakes the runtimeConfig defaults (frontend SHA "unknown");
    // the backend reports a different commit, so the tag labels both sides.
    registerEndpoint('/api/version', () => ({
      version: 'dev',
      gitSha: '9f8e7d6',
      builtAt: '2026-06-12T00:00:00Z',
    }))
    await renderSuspended(BuildTag)

    expect(await screen.findByText(/fe unknown · be 9f8e7d6/)).toBeVisible()
  })
})
