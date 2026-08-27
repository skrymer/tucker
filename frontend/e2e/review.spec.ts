import { expect, test } from './support/test'
import {
  mockIntakeBreakdown,
  mockNoActiveGoal,
  mockReviewHistory,
  mockReviewHistoryError,
} from './support/mock-api'
import { weeklyReview } from '../test/review-fixtures'

test('shows a retryable error instead of an empty ledger when the review history fails to load', async ({
  page,
  goto,
}) => {
  await mockNoActiveGoal(page)
  await mockIntakeBreakdown(page)
  await mockReviewHistoryError(page)

  await goto('/review', { waitUntil: 'hydration' })

  await expect(
    page.getByRole('heading', { name: "Couldn't load your reviews" }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
})

// The ledger picks its columns from the data, not from the current setting: a
// User who turned Calorie Tracking off keeps every Budget they ever had, and one
// who turned it on gets no columns of em-dashes over the weeks they did not.
test('a mixed history keeps its calorie columns and em-dashes the weeks without targets', async ({
  page,
  goto,
}) => {
  await mockNoActiveGoal(page)
  await mockIntakeBreakdown(page)
  await mockReviewHistory(page, [
    weeklyReview({ id: 1, reviewedOn: '2026-06-01', trendWeightKg: 86 }),
    weeklyReview({
      id: 2,
      reviewedOn: '2026-06-08',
      trendWeightKg: 85.4,
      intakeTargets: null,
    }),
    weeklyReview({ id: 3, reviewedOn: '2026-06-15', trendWeightKg: 85 }),
  ])

  await goto('/review', { waitUntil: 'hydration' })

  await expect(page.getByRole('main')).toMatchAriaSnapshot()
})

test('a history with no targets at all is a dated trend, not four empty columns', async ({
  page,
  goto,
}) => {
  await mockNoActiveGoal(page)
  await mockIntakeBreakdown(page)
  await mockReviewHistory(page, [
    weeklyReview({
      id: 1,
      reviewedOn: '2026-06-01',
      trendWeightKg: 86,
      intakeTargets: null,
    }),
    weeklyReview({
      id: 2,
      reviewedOn: '2026-06-08',
      trendWeightKg: 85.4,
      intakeTargets: null,
    }),
  ])

  await goto('/review', { waitUntil: 'hydration' })

  await expect(page.getByRole('main')).toMatchAriaSnapshot()
})
