import { describe, expect, it } from 'vitest'
import { CATALOG_ADD_ROUTE, opensAddSheet } from './catalog'

describe('the catalog hand-off', () => {
  it('reads the query its own link carries, so the two cannot drift apart', () => {
    const query = Object.fromEntries(
      new URLSearchParams(CATALOG_ADD_ROUTE.split('?')[1]),
    )

    expect(opensAddSheet(query)).toBe(true)
  })

  it('leaves the catalog closed when nothing asked for the sheet', () => {
    expect(opensAddSheet({})).toBe(false)
    expect(opensAddSheet({ add: '0' })).toBe(false)
  })
})
