import { describe, expect, it } from 'vitest'
import { paceBadge } from './pace'

describe('paceBadge', () => {
  it('shows ahead and on-pace as success', () => {
    expect(paceBadge('ahead')).toEqual({ label: 'Ahead', color: 'success' })
    expect(paceBadge('on-pace')).toEqual({ label: 'On pace', color: 'success' })
  })

  it('shows behind as a warning', () => {
    expect(paceBadge('behind')).toEqual({ label: 'Behind', color: 'warning' })
  })

  it('shows stalled as neutral', () => {
    expect(paceBadge('stalled')).toEqual({ label: 'Stalled', color: 'neutral' })
  })
})
