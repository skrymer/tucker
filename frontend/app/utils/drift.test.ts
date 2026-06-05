import { describe, expect, it } from 'vitest'
import { driftBadge } from './drift'

describe('driftBadge', () => {
  it('shows holding as success', () => {
    expect(driftBadge('holding')).toEqual({
      label: 'Holding',
      color: 'success',
    })
  })

  it('shows drift in either direction as a warning', () => {
    expect(driftBadge('drifting-up')).toEqual({
      label: 'Drifting up',
      color: 'warning',
    })
    expect(driftBadge('drifting-down')).toEqual({
      label: 'Drifting down',
      color: 'warning',
    })
  })

  it('shows the pre-14-day gathering-data state as neutral', () => {
    expect(driftBadge('gathering-data')).toEqual({
      label: 'Gathering data',
      color: 'neutral',
    })
  })
})
