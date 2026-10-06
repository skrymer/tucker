import { expect, test } from './support/test'
import { profileOf, weightOnlyProfile } from '../test/mocks/handlers/profile'
import {
  noIntakeTargets,
  setupUnfinished,
  summaryWith,
} from '../test/mocks/handlers/summary'
import { weightMeasurements } from '../test/mocks/handlers/weight'

/** Setup unfinished: no Budget, and no reading for one to be built from. */
const beforeSetup = () => [
  summaryWith(setupUnfinished),
  ...weightMeasurements(null),
]

test('the Today page nudges the user to finish setup when there is no budget', async ({
  page,
  goto,
  network,
}) => {
  network.use(...beforeSetup())

  await goto('/', { waitUntil: 'hydration' })

  await expect(
    page.getByText(/finish setup to see your calorie budget/i),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: /finish setup/i }),
  ).toHaveAttribute('href', '/profile')
})

test('the Today page hides the setup nudge once setup is complete', async ({
  page,
  goto,
}) => {
  // The baseline is set up, with a Budget.
  await goto('/', { waitUntil: 'hydration' })

  await expect(page.getByText(/kcal left/)).toBeVisible()
  await expect(
    page.getByText(/finish setup to see your calorie budget/i),
  ).toHaveCount(0)
})

test('the Today page asks a weight-only user for their first weight, not for a budget', async ({
  page,
  goto,
  network,
}) => {
  // Setup genuinely unfinished — no reading yet — for a User who has chosen not
  // to count calories. The same absent Budget, the opposite sentence.
  network.use(profileOf(weightOnlyProfile), ...beforeSetup())

  await goto('/', { waitUntil: 'hydration' })

  await expect(
    page.getByText(/log your first weight to get started/i),
  ).toBeVisible()
  await expect(page.getByText(/calorie budget/i)).toHaveCount(0)
  await expect(page.getByRole('link', { name: /finish setup/i })).toHaveCount(0)
})

test('the Today page hides the setup nudge from a weight-only user who has weighed in', async ({
  page,
  goto,
  network,
}) => {
  // Finished setup and no Budget by choice: there is nothing left to nag about.
  network.use(profileOf(weightOnlyProfile), summaryWith(noIntakeTargets))

  await goto('/', { waitUntil: 'hydration' })

  await expect(
    page.getByRole('heading', { name: "Today's weight" }),
  ).toBeVisible()
  await expect(page.getByText(/get started/i)).toHaveCount(0)
  await expect(page.getByText(/finish setup/i)).toHaveCount(0)
})
