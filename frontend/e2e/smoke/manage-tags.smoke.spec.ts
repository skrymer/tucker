import { test, expect } from './support/smoke-test'
import { expectCreated } from './support/seeding'

// F18 slice 5 smoke: Manage tags against the real backend. A Tag is created from
// the sheet before anything carries it (and naming it again in another case does
// not duplicate it), put on a Food, and deleted — and the Food is still in the
// catalog, carrying nothing. On the way, Log offers the Tag a Food carries and
// not the empty one Manage tags still lists. The per-test reset wipes the seed,
// so there is no cleanup.
const API = 'http://localhost:8080/api'

test('a Tag created in Manage tags, put on a Food and deleted leaves the Food in the catalog', async ({
  page,
  goto,
  request,
}) => {
  await expectCreated(
    request.post(`${API}/foods`, {
      data: {
        tagIds: [],
        name: 'Rolled oats',
        proteinPer100g: 13,
        carbsPer100g: 60,
        fatPer100g: 7,
      },
    }),
  )
  await goto('/foods', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Manage tags' }).click()
  const manage = page.getByRole('dialog', { name: 'Manage tags' })
  const newTag = manage.getByRole('textbox', { name: 'New tag' })
  // Each name waits for its row: on a phone the sheet grows upward as a row
  // lands, which moves Add under the next click.
  for (const [name, listed] of [
    ['Snack', 1],
    ['dinner', 2],
    ['snack', 2],
  ] as const) {
    await newTag.fill(name)
    await manage.getByRole('button', { name: 'Add' }).click()
    await expect(newTag).toHaveValue('')
    await expect(manage.getByRole('listitem')).toHaveCount(listed)
    await expect(manage.getByRole('button', { name: 'Add' })).toBeEnabled()
  }
  await expect(manage.getByRole('list')).toMatchAriaSnapshot(`
    - list:
      - /children: deep-equal
      - listitem:
        - text: dinner 0 foods
        - button "Delete dinner"
      - listitem:
        - text: Snack 0 foods
        - button "Delete Snack"
  `)
  await manage.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: 'Tags for Rolled oats' }).click()
  const tagging = page.getByRole('dialog', { name: 'Tags for Rolled oats' })
  await tagging.getByRole('combobox').fill('Snack')
  await page.getByRole('option', { name: 'Snack', exact: true }).click()
  await tagging.getByRole('button', { name: 'Save tags' }).click()
  await expect(tagging).toBeHidden()

  await goto('/log', { waitUntil: 'hydration' })
  await expect(
    page.getByRole('group', { name: 'Filter by tag' }).getByRole('button'),
  ).toHaveText(['All', 'Snack'])

  await goto('/foods', { waitUntil: 'hydration' })
  await page.getByRole('button', { name: 'Manage tags' }).click()
  await manage.getByRole('button', { name: 'Delete Snack' }).click()
  await expect(
    manage.getByText(
      'Delete “Snack”? It comes off 1 food. The foods stay in your catalog.',
    ),
  ).toBeVisible()
  await manage.getByRole('button', { name: 'Delete tag' }).click()
  await expect(manage.getByRole('listitem')).toHaveText([/dinner/])
  await manage.getByRole('button', { name: 'Close' }).click()

  await expect(page.getByText('Rolled oats')).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'Tags on Rolled oats' }),
  ).toHaveCount(0)
  const foods = (await (await request.get(`${API}/foods`)).json()) as Array<{
    name: string
    tags: unknown[]
  }>
  expect(foods).toEqual([
    expect.objectContaining({ name: 'Rolled oats', tags: [] }),
  ])
})
