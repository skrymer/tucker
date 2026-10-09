import { describe, expect, it } from 'vitest'
import { typeCaption } from './typeCaption'

describe('typeCaption', () => {
  it('states a computed size, line-height and weight the way DESIGN.md writes them', () => {
    expect(
      typeCaption({
        fontSize: '24px',
        lineHeight: '31.92px',
        fontWeight: '700',
        letterSpacing: 'normal',
      }),
    ).toBe('24px / 1.33 · 700')
  })

  it('adds tracking as a share of the size when the element has any', () => {
    expect(
      typeCaption({
        fontSize: '11.5px',
        lineHeight: '14.95px',
        fontWeight: '650',
        letterSpacing: '0.69px',
      }),
    ).toBe('11.5px / 1.3 · 650 · +0.06em')
  })
})
