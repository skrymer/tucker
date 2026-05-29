import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import SetupBanner from './SetupBanner.vue'

describe('SetupBanner', () => {
  it('prompts the user to finish setup when there is no calorie budget yet', async () => {
    await renderSuspended(SetupBanner, { props: { calorieBudget: null } })

    expect(screen.getByText(/calorie budget/i)).toBeVisible()
  })

  it('stays out of the way once a calorie budget exists', async () => {
    await renderSuspended(SetupBanner, { props: { calorieBudget: 2000 } })

    expect(screen.queryByText(/calorie budget/i)).not.toBeInTheDocument()
  })

  it('offers a call to action that links to the profile', async () => {
    await renderSuspended(SetupBanner, { props: { calorieBudget: null } })

    const cta = screen.getByRole('link', { name: /finish setup/i })
    expect(cta).toHaveAttribute('href', '/profile')
  })
})
