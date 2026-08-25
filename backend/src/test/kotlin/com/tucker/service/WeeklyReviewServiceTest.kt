package com.tucker.service

import com.tucker.domain.EstimatedEntry
import com.tucker.domain.Goal
import com.tucker.domain.IntakeTargets
import com.tucker.domain.Maintenance
import com.tucker.domain.Profile
import com.tucker.domain.Sex
import com.tucker.domain.WeightMeasurement
import com.tucker.domain.WeeklyReview
import com.tucker.domain.targets
import com.tucker.persistence.EntryRepository
import com.tucker.persistence.GoalRepository
import com.tucker.persistence.ProfileRepository
import com.tucker.persistence.WeeklyReviewRepository
import com.tucker.persistence.WeightMeasurementRepository
import com.tucker.security.WithTuckerUser
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

@SpringBootTest
@Transactional
@WithTuckerUser
class WeeklyReviewServiceTest {

    @Autowired lateinit var service: WeeklyReviewService
    @Autowired lateinit var weights: WeightMeasurementRepository
    @Autowired lateinit var entries: EntryRepository
    @Autowired lateinit var profiles: ProfileRepository
    @Autowired lateinit var goals: GoalRepository
    @Autowired lateinit var reviews: WeeklyReviewRepository

    private val today = LocalDate.of(2026, 5, 22)

    private fun seedProfileAndGoal() {
        profiles.save(Profile(Sex.MALE, LocalDate.of(1986, 5, 22), 180.0))
        goals.insert(Goal(null, today.minusMonths(1), 90.0, 80.0, 0.5, active = true))
    }

    private fun seedSetupWithWeights() {
        seedProfileAndGoal()
        weights.save(WeightMeasurement(null, today.minusDays(1), 86.0))
        weights.save(WeightMeasurement(null, today, 85.8))
    }

    /** Maintenance Mode setup: a profile and weights, but deliberately no Goal. */
    private fun seedProfileAndWeightsNoGoal(tracksCalories: Boolean = true) {
        profiles.save(Profile(Sex.MALE, LocalDate.of(1986, 5, 22), 180.0, tracksCalories = tracksCalories))
        weights.save(WeightMeasurement(null, today.minusDays(1), 86.0))
        weights.save(WeightMeasurement(null, today, 85.8))
    }

    /** A flat trend (every reading 86.0) so the adaptive weight-change term is zero. */
    private fun seedFlatTrend() {
        weights.save(WeightMeasurement(null, today.minusDays(14), 86.0))
        weights.save(WeightMeasurement(null, today, 86.0))
    }

    /** Log 2000 kcal on each window day in [offsets] (days before today). */
    private fun logIntakeDays(offsets: IntProgression) {
        for (offset in offsets) {
            entries.insert(EstimatedEntry(null, today.minusDays(offset.toLong()), "Day's intake", 2000.0, 130.0))
        }
    }

    /** A prior review on [reviewedOn], inserted directly to stand in as the cadence anchor. */
    private fun seedReviewOn(reviewedOn: LocalDate): WeeklyReview =
        reviews.insert(
            WeeklyReview(
                id = null,
                reviewedOn = reviewedOn,
                trendWeightKg = 86.0,
                intakeTargets = IntakeTargets(
                    maintenance = Maintenance(2400.0, Maintenance.Basis.FORMULA_SEED),
                    calorieBudgetKcal = 1850.0,
                    proteinFloorG = 172.0,
                ),
            ),
        )

    @Test
    fun `with Calorie Tracking off the review records the Trend Weight and no Intake Targets`() {
        seedProfileAndWeightsNoGoal(tracksCalories = false)

        val review = service.runReview(today)

        // The review's other job still runs: a weekly dated reading of where the
        // trend is going. The Budget is absent rather than zero, because a Budget
        // this User can never correct is one they should never be shown (ADR 0024).
        assertNull(review.intakeTargets)
        assertEquals(85.9, review.trendWeightKg, 0.2)
    }

    @Test
    fun `catch-up keeps the weekly cadence with Calorie Tracking off`() {
        seedProfileAndWeightsNoGoal(tracksCalories = false)
        reviews.insert(WeeklyReview(null, today.minusDays(7), 86.0, intakeTargets = null))

        service.catchUpIfDue(today)

        // One engine, one cadence, whatever the User counts (CONTEXT.md — Weekly
        // Review). Only the adaptive half is gated, so the overdue week still
        // produces its dated reading.
        val latest = reviews.latest()!!
        assertEquals(today, latest.reviewedOn)
        assertNull(latest.intakeTargets)
    }

    @Test
    fun `with little history the review uses the formula seed`() {
        seedProfileAndGoal()
        weights.save(WeightMeasurement(null, today.minusDays(1), 86.0))
        weights.save(WeightMeasurement(null, today, 85.8))

        val review = service.runReview(today)

        assertEquals(Maintenance.Basis.FORMULA_SEED, review.targets.maintenance.basis)
        assertTrue(review.targets.maintenance.kcal > 0)
        // Budget = maintenance - the deficit implied by 0.5 kg/week (~550 kcal).
        assertEquals(review.targets.maintenance.kcal - 0.5 * 7700.0 / 7.0, review.targets.calorieBudgetKcal, 0.5)
        // Protein floor = 2 g per kg of trend weight.
        assertEquals(2.0 * review.trendWeightKg, review.targets.proteinFloorG)
    }

    @Test
    fun `with no active Goal the review budgets at maintenance and floors protein from the trend`() {
        seedProfileAndWeightsNoGoal()

        val review = service.runReview(today)

        // Maintenance Mode: no deficit is subtracted, so the Budget is Maintenance.
        assertEquals(review.targets.maintenance.kcal, review.targets.calorieBudgetKcal, 1e-9)
        // The Protein Floor still applies, derived from the trend (2 g/kg).
        assertEquals(2.0 * review.trendWeightKg, review.targets.proteinFloorG, 1e-9)
    }

    @Test
    fun `with a trend anchor but no logged intake the review falls back to the seed`() {
        seedProfileAndGoal()
        // A weight at the window start (so the trend has an anchor) but nothing
        // logged since — adaptive has no intake to correct against, so deriving
        // maintenance from a phantom zero-calorie diet would be nonsense.
        weights.save(WeightMeasurement(null, today.minusDays(14), 86.0))

        val review = service.runReview(today)

        assertEquals(Maintenance.Basis.FORMULA_SEED, review.targets.maintenance.basis)
        assertTrue(review.targets.maintenance.kcal > 0)
    }

    @Test
    fun `with a full window of data the review adapts`() {
        seedProfileAndGoal()
        // 16 days of measurements trending down, ~2000 kcal logged each window day.
        for (offset in 16 downTo 0) {
            val day = today.minusDays(offset.toLong())
            weights.save(WeightMeasurement(null, day, 86.0 - (16 - offset) * 0.06))
            entries.insert(EstimatedEntry(null, day, "Day's intake", 2000.0, 130.0))
        }

        val review = service.runReview(today)

        assertEquals(Maintenance.Basis.ADAPTIVE, review.targets.maintenance.basis)
        assertTrue(review.targets.maintenance.kcal > 0)
        assertTrue(review.targets.calorieBudgetKcal > 0)
    }

    @Test
    fun `adaptive maintenance averages intake over the days actually logged, not the whole window`() {
        seedProfileAndGoal()
        seedFlatTrend() // zeroes the weight-change term, so maintenance == the intake average
        // 2000 kcal on 10 of the 14 window days; today-4..today-1 are left unlogged.
        // Averaged over the whole window the four gaps would read as zero-calorie days
        // and drag the average to ~1429; over the 10 logged days it is the true 2000.
        logIntakeDays(14 downTo 5)

        val review = service.runReview(today)

        assertEquals(Maintenance.Basis.ADAPTIVE, review.targets.maintenance.basis)
        assertEquals(2000.0, review.targets.maintenance.kcal, 0.5)
    }

    @Test
    fun `enough logged days but no calories falls back instead of computing a non-positive maintenance`() {
        seedProfileAndGoal()
        seedFlatTrend() // flat trend → zero weight-change term, so a zero intake would yield 0 kcal
        // 10 logged days clearing the coverage floor, but every entry is zero-calorie
        // (e.g. water): real coverage, no intake signal. Averaging would produce a
        // non-positive maintenance, which must never be persisted.
        for (offset in 14 downTo 5) {
            entries.insert(EstimatedEntry(null, today.minusDays(offset.toLong()), "Water", 0.0, 0.0))
        }

        val review = service.runReview(today) // must not throw

        assertTrue(review.targets.maintenance.kcal > 0)
        assertEquals(Maintenance.Basis.FORMULA_SEED, review.targets.maintenance.basis) // no prior → seed
    }

    @Test
    fun `below the logging-coverage floor maintenance holds the previous review's value`() {
        seedProfileAndGoal()
        seedFlatTrend()
        val prior = seedReviewOn(today.minusDays(7)) // maintenance 2400
        // Only 9 of the 14 window days logged — below the 10-day floor, so the engine
        // must not recompute from this thin sample; it holds the prior maintenance.
        logIntakeDays(14 downTo 6)

        val review = service.runReview(today)

        assertEquals(Maintenance.Basis.HELD, review.targets.maintenance.basis)
        assertEquals(prior.targets.maintenance.kcal, review.targets.maintenance.kcal, 1e-9)
    }

    @Test
    fun `below the floor holds the most recent earlier review, not a later-dated one`() {
        seedProfileAndGoal()
        seedFlatTrend()
        val earlier = seedReviewOn(today.minusDays(7)) // maintenance 2400
        // A later-dated review must not be what gets held — the global latest would
        // wrongly carry its value backward.
        reviews.insert(
            WeeklyReview(
                null, today.plusDays(7), 86.0,
                IntakeTargets(Maintenance(9999.0, Maintenance.Basis.FORMULA_SEED), 9000.0, 172.0),
            ),
        )
        logIntakeDays(14 downTo 6) // 9 days, below the floor

        val review = service.runReview(today)

        assertEquals(Maintenance.Basis.HELD, review.targets.maintenance.basis)
        assertEquals(earlier.targets.maintenance.kcal, review.targets.maintenance.kcal, 1e-9)
    }

    @Test
    fun `turning Calorie Tracking on after a weight-only stretch seeds rather than holding`() {
        seedProfileAndGoal()
        seedFlatTrend()
        // Last week's review was run with Calorie Tracking off, so it carries a Trend
        // Weight and nothing to hold. Reviews are weekly and contiguous, so "the
        // immediately preceding review has no targets" is exactly "tracking was off
        // last week" — a cold start, not a lapsed logger (ADR 0024 vs ADR 0018).
        seedReviewOn(today.minusDays(30)) // the last week tracking was on, long past
        reviews.insert(WeeklyReview(null, today.minusDays(7), 86.0, intakeTargets = null))
        logIntakeDays(14 downTo 6) // 9 days, below the coverage floor: it cannot adapt either

        val review = service.runReview(today)

        assertEquals(Maintenance.Basis.FORMULA_SEED, review.targets.maintenance.basis)
    }

    @Test
    fun `a Calorie Tracking toggle a day old holds Maintenance rather than re-seeding`() {
        seedProfileAndGoal()
        seedFlatTrend()
        // Tracking was on last week and its review holds 2400. It went off yesterday
        // — the toggle recomputed that day with no targets — and back on today. A
        // setting flipped for one day is not a weight-only stretch, so the figure it
        // was holding is still about this body and must survive (ADR 0024).
        val prior = seedReviewOn(today.minusDays(6))
        reviews.insert(WeeklyReview(null, today.minusDays(1), 86.0, intakeTargets = null))
        logIntakeDays(14 downTo 6) // 9 days, below the coverage floor: it cannot adapt

        val review = service.runReview(today)

        assertEquals(Maintenance.Basis.HELD, review.targets.maintenance.basis)
        assertEquals(prior.targets.maintenance.kcal, review.targets.maintenance.kcal, 1e-9)
    }

    @Test
    fun `a toggle after a long absence holds, because absence is not a stretch`() {
        seedProfileAndGoal()
        seedFlatTrend()
        // Away for a fortnight, so the only figure to hold is a fortnight old — and
        // ADR 0018 holds through absence however long it lasts. Opening Tucker minted
        // a review yesterday, the toggle-off overwrote it with a target-less one, and
        // tracking is back today. The gap is one day, so the old figure carries.
        val prior = seedReviewOn(today.minusDays(14))
        reviews.insert(WeeklyReview(null, today.minusDays(1), 86.0, intakeTargets = null))
        logIntakeDays(14 downTo 6) // 9 days, below the coverage floor: it cannot adapt

        val review = service.runReview(today)

        assertEquals(Maintenance.Basis.HELD, review.targets.maintenance.basis)
        assertEquals(prior.targets.maintenance.kcal, review.targets.maintenance.kcal, 1e-9)
    }

    @Test
    fun `sparse logging with no prior review to hold falls back to the seed`() {
        seedProfileAndGoal()
        seedFlatTrend()
        // 5 logged days — below the floor — and no prior review exists to hold, so the
        // only sound figure is the formula seed (the cold-start path). The old engine
        // would have adapted off this thin sample.
        logIntakeDays(14 downTo 10)

        val review = service.runReview(today)

        assertEquals(Maintenance.Basis.FORMULA_SEED, review.targets.maintenance.basis)
    }

    @Test
    fun `a second run for the same day returns the existing review without inserting a duplicate`() {
        seedSetupWithWeights()

        val first = service.runReview(today)
        val second = service.runReview(today)

        assertEquals(first.id, second.id)
        assertEquals(1, reviews.findAll().size)
    }

    @Test
    fun `a run for a date that already has a review returns it even when a later review is the latest`() {
        seedSetupWithWeights()
        val existing = seedReviewOn(today)
        // A later review makes today's no longer the latest by date — the guard must
        // look up by date, not compare only against latest(), or the insert collides
        // with the reviewed_on UNIQUE constraint.
        seedReviewOn(today.plusDays(5))

        val rerun = service.runReview(today)

        assertEquals(existing.id, rerun.id)
        assertEquals(2, reviews.findAll().size)
    }

    @Test
    fun `recompute overwrites a stale same-day review with a freshly computed one`() {
        seedSetupWithWeights()
        val stale = seedReviewOn(today)

        val recomputed = service.recomputeFor(today)

        // The same-day record is replaced, not duplicated, and the fresh values persist.
        assertEquals(1, reviews.findAll().size)
        assertEquals(today, recomputed.reviewedOn)
        val reloaded = reviews.findByReviewedOn(today)!!
        assertTrue(reloaded.targets.calorieBudgetKcal != stale.targets.calorieBudgetKcal)
        assertEquals(recomputed.targets.calorieBudgetKcal, reloaded.targets.calorieBudgetKcal)
    }

    @Test
    fun `catch-up runs a review when the latest one is a week old`() {
        seedSetupWithWeights()
        seedReviewOn(today.minusDays(7))

        service.catchUpIfDue(today)

        assertEquals(today, reviews.latest()!!.reviewedOn)
        assertEquals(2, reviews.findAll().size)
    }

    @Test
    fun `catch-up runs no review when the latest one is less than a week old`() {
        seedSetupWithWeights()
        seedReviewOn(today.minusDays(6))

        service.catchUpIfDue(today)

        assertEquals(today.minusDays(6), reviews.latest()!!.reviewedOn)
        assertEquals(1, reviews.findAll().size)
    }

    @Test
    fun `catch-up runs exactly one review after a multi-week gap, dated today`() {
        seedSetupWithWeights()
        seedReviewOn(today.minusDays(21))

        service.catchUpIfDue(today)

        // One catch-up snapping to today, never one-per-missed-week.
        assertEquals(2, reviews.findAll().size)
        assertEquals(today, reviews.latest()!!.reviewedOn)
    }

    @Test
    fun `catch-up bootstraps the first review in Maintenance Mode when none exists yet`() {
        // Profile + a weight, but no Goal and no prior review. Nothing has fired a
        // first review (a Goal would have), so the summary read must bootstrap one.
        seedProfileAndWeightsNoGoal()

        service.catchUpIfDue(today)

        assertEquals(1, reviews.findAll().size)
        val review = reviews.latest()!!
        assertEquals(today, review.reviewedOn)
        // It is a Maintenance review: Budget = Maintenance, no deficit.
        assertEquals(review.targets.maintenance.kcal, review.targets.calorieBudgetKcal, 1e-9)
    }

    @Test
    fun `catch-up is a no-op and does not throw when setup is incomplete`() {
        // A due review on paper, but no active Goal / Profile / weight to run it on.
        seedReviewOn(today.minusDays(21))

        service.catchUpIfDue(today)

        assertEquals(1, reviews.findAll().size)
    }
}
