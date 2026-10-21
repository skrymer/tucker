import { describe, expect, it } from 'vitest'
import { routeTemplate } from './routeTemplate'

describe('a route template', () => {
  it('names a parameter as its page file does, never by its value', () => {
    expect(routeTemplate('/foods/:id()')).toBe('/foods/[id]')
  })

  // A page can constrain its parameter, which the router keeps inside the brackets.
  it('drops a parameter pattern with the value it would match', () => {
    expect(routeTemplate('/foods/:id(\\d+)')).toBe('/foods/[id]')
  })
})
