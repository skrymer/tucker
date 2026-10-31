import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import PaceBadge from './PaceBadge.vue'

describe('PaceBadge', () => {
  it('names the observed pace', async () => {
    await renderSuspended(PaceBadge, { props: { paceStatus: 'behind' } })

    expect(screen.getByText('Behind')).toBeVisible()
  })

  it('draws nothing while the pace is withheld', async () => {
    const { container } = await renderSuspended(PaceBadge, {
      props: { paceStatus: null },
    })

    expect(container).toHaveTextContent(/^$/)
  })
})
