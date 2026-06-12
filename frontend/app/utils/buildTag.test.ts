import { describe, expect, it } from 'vitest'
import { formatBuildTag } from './buildTag'

describe('formatBuildTag', () => {
  it('shows a single SHA when the frontend and backend ran from the same commit', () => {
    expect(formatBuildTag('0.1.0', 'a1b2c3d', 'a1b2c3d')).toBe(
      'v0.1.0 (a1b2c3d)',
    )
  })

  it('labels both SHAs when the frontend and backend builds differ (a partial deploy)', () => {
    expect(formatBuildTag('0.1.0', 'a1b2c3d', '9f8e7d6')).toBe(
      'v0.1.0 (fe a1b2c3d · be 9f8e7d6)',
    )
  })

  it('falls back to the frontend SHA alone when the backend version is unavailable', () => {
    expect(formatBuildTag('0.1.0', 'a1b2c3d', null)).toBe('v0.1.0 (a1b2c3d)')
  })
})
