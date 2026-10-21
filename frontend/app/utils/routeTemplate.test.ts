import { describe, expect, it } from 'vitest'
import { routeTemplate } from './routeTemplate'

describe('a route template', () => {
  it('names a parameter as its page file does, never by its value', () => {
    expect(routeTemplate('/foods/:id()')).toBe('/foods/[id]')
  })
})
