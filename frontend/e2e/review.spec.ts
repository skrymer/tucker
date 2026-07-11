import { expect, test } from './support/test'
import { mockNoActiveGoal, mockReviewHistoryError } from './support/mock-api'

test('shows a retryable error instead of an empty ledger when the review history fails to load', async ({
  page,
  goto,
}) => {
  await mockNoActiveGoal(page)
  await mockReviewHistoryError(page)

  await goto('/review', { waitUntil: 'hydration' })

  await expect(
    page.getByRole('heading', { name: "Couldn't load your reviews" }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
})
