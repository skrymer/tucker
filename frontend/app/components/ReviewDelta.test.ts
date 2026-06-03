import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import ReviewDelta from './ReviewDelta.vue'

describe('ReviewDelta', () => {
  it('announces an increase with its magnitude', async () => {
    await renderSuspended(ReviewDelta, { props: { value: 50 } })

    expect(
      screen.getByText(/up by 50 versus the previous review/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/▲ \+50/)).toBeVisible()
  })

  it('announces a decrease with weight to one decimal place', async () => {
    await renderSuspended(ReviewDelta, {
      props: { value: -1.2, decimals: 1 },
    })

    expect(
      screen.getByText(/down by 1\.2 versus the previous review/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/▼ −1\.2/)).toBeVisible()
  })

  it('shows an em-dash placeholder when there is no previous review', async () => {
    await renderSuspended(ReviewDelta, {
      props: { value: null, placeholder: true },
    })

    expect(screen.getByText('—')).toBeVisible()
  })

  it('renders nothing when there is no previous review and no placeholder', async () => {
    await renderSuspended(ReviewDelta, { props: { value: null } })

    expect(screen.queryByText('—')).not.toBeInTheDocument()
    expect(
      screen.queryByText(/versus the previous review/i),
    ).not.toBeInTheDocument()
  })
})
