import { test, expect } from './support/smoke-test'
import { create } from './support/seeding'

// F18 slice 6 smoke: renaming a Tag onto another Tag's name, in another case,
// merges the two against the real backend. The sheet warns with both Food counts
// before anything is sent, and afterwards every Food of either Tag — one of them
// carrying both — carries exactly the Tag that existed, spelled as it was. The
// per-test reset wipes the seed, so there is no cleanup.
const API = 'http://localhost:8080/api'

test('renaming a Tag onto another’s name merges them, and the Foods of both carry the one that existed', async ({
  page,
  goto,
  request,
}) => {
  const food = (name: string, tagIds: number[]) =>
    create(request, '/foods', {
      name,
      tagIds,
      proteinPer100g: 5,
      carbsPer100g: 60,
      fatPer100g: 20,
    })
  const snack = await create(request, '/tags', { name: 'Snack' })
  const treats = await create(request, '/tags', { name: 'treats' })
  await food('Apple', [snack])
  await food('Biscuit', [snack, treats])
  await food('Chocolate', [treats])
  await goto('/foods', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Manage tags' }).click()
  const manage = page.getByRole('dialog', { name: 'Manage tags' })
  await manage.getByRole('button', { name: 'Rename treats' }).click()
  await manage.getByRole('textbox', { name: 'Rename treats' }).fill('SNACK')
  await expect(
    manage.getByText(
      '“Snack” already exists — its 2 foods and this tag’s 2 foods become one tag.',
      { exact: true },
    ),
  ).toBeVisible()
  await manage.getByRole('button', { name: 'Merge' }).click()

  await expect(manage.getByRole('list')).toMatchAriaSnapshot(`
    - list:
      - /children: deep-equal
      - listitem:
        - text: Snack 3 foods
        - button "Rename Snack"
        - button "Delete Snack"
  `)
  await manage.getByRole('button', { name: 'Close' }).click()
  for (const name of ['Apple', 'Biscuit', 'Chocolate'])
    await expect(
      page.getByRole('list', { name: `Tags on ${name}` }).getByRole('listitem'),
    ).toHaveText(['Snack'])

  const foods = (await (await request.get(`${API}/foods`)).json()) as Array<{
    name: string
    tags: Array<{ id: number; name: string }>
  }>
  expect(
    foods
      .map((f) => [f.name, f.tags])
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
  ).toEqual([
    ['Apple', [{ id: snack, name: 'Snack' }]],
    ['Biscuit', [{ id: snack, name: 'Snack' }]],
    ['Chocolate', [{ id: snack, name: 'Snack' }]],
  ])
})
