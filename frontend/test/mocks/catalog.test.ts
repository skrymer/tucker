import { describe, expect, it } from 'vitest'
import { food } from '../food-fixtures'
import { foodCatalog } from './handlers/catalog'
import { server, useMswServer } from './node'

useMswServer()

describe('foodCatalog', () => {
  it("lists Foods as the backend's SQL lower() orders them, which folds ASCII alone", async () => {
    server.use(
      ...foodCatalog({
        foods: [
          food({ id: 1, name: 'éclair' }),
          food({ id: 2, name: 'Énergy bar' }),
          food({ id: 3, name: 'Apple' }),
        ],
      }),
    )

    const listed = await useNuxtApp().$api('/api/foods')

    // An accented capital is left as it is, so "É" (U+00C9) sorts before "é"
    // (U+00E9) whatever follows it.
    expect(listed.map((f) => f.name)).toEqual(['Apple', 'Énergy bar', 'éclair'])
  })

  it('takes back the borrow of a Food it does not hold as the absent delete it is: 204', async () => {
    server.use(...foodCatalog())

    const answer = await fetch(
      `${location.origin}/api/foods/999/reference-food`,
      { method: 'DELETE' },
    )

    expect(answer.status).toBe(204)
  })
})
