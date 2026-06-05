package com.tucker.service

import com.tucker.domain.Goal
import com.tucker.domain.Profile
import com.tucker.domain.Sex
import com.tucker.domain.WeightMeasurement
import com.tucker.persistence.GoalRepository
import com.tucker.persistence.ProfileRepository
import com.tucker.persistence.WeeklyReviewRepository
import com.tucker.persistence.WeightMeasurementRepository
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@SpringBootTest
@Transactional
class GoalServiceTest {

    @Autowired lateinit var service: GoalService
    @Autowired lateinit var goals: GoalRepository
    @Autowired lateinit var weights: WeightMeasurementRepository
    @Autowired lateinit var profiles: ProfileRepository
    @Autowired lateinit var reviews: WeeklyReviewRepository

    private val today = LocalDate.of(2026, 5, 29)

    private fun newGoal(rate: Double = 0.5) =
        Goal(null, today, 90.0, 80.0, rate, active = true)

    private fun seedProfileAndWeight() {
        profiles.save(Profile(Sex.MALE, LocalDate.of(1986, 5, 22), 180.0))
        weights.save(WeightMeasurement.recorded(today, 86.0, today))
    }

    @Test
    fun `the first goal on a fresh install fires the first weekly review`() {
        seedProfileAndWeight()

        service.replaceActiveGoal(newGoal(), today)

        val review = reviews.latest()
        assertNotNull(review, "expected a weekly review to have been fired")
        assertEquals(today, review.reviewedOn)
    }

    @Test
    fun `replacing a goal recomputes today's review for the new goal's deficit`() {
        seedProfileAndWeight()
        // An existing plan, with today's review already reflecting its slower rate.
        service.replaceActiveGoal(newGoal(rate = 0.5), today)
        val before = reviews.findByReviewedOn(today)!!.calorieBudgetKcal

        // Replace it with a steeper rate — a deliberate Goal change.
        service.replaceActiveGoal(newGoal(rate = 0.75), today)

        // Today's review is recomputed in place: same maintenance, larger deficit, so
        // the Budget drops immediately rather than waiting for the weekly cadence.
        val after = reviews.findByReviewedOn(today)!!.calorieBudgetKcal
        val extraDeficit = (0.75 - 0.5) * Goal.KCAL_PER_KG_FAT / Goal.DAYS_PER_WEEK
        assertEquals(before - extraDeficit, after, 0.5)
        assertEquals(1, reviews.findAll().size)
    }

    @Test
    fun `deactivating the active goal switches to maintenance and recomputes today's review`() {
        seedProfileAndWeight()
        service.replaceActiveGoal(newGoal(rate = 0.5), today)
        val cutBudget = reviews.findByReviewedOn(today)!!.calorieBudgetKcal

        service.deactivateActiveGoal(today)

        // No Goal is active any more — the user is maintaining.
        assertNull(goals.findActive())
        // Today's review is recomputed in place to the Maintenance budget (no deficit),
        // so it lifts above the cut budget rather than waiting for the weekly cadence.
        val review = reviews.findByReviewedOn(today)!!
        assertEquals(review.maintenanceKcal, review.calorieBudgetKcal, 1e-9)
        assertEquals(cutBudget + newGoal(rate = 0.5).dailyDeficitKcal(), review.calorieBudgetKcal, 0.5)
        assertEquals(1, reviews.findAll().size)
    }

    @Test
    fun `rejects a goal whose target is not below the current trend weight`() {
        // The latest reading is 86.0, so the Trend Weight is 86.0. A start of 90
        // keeps the domain start-weight rule satisfied, but a target of 86 equals
        // the trend — the Goal would be already-reached and stamp reachedOn on the
        // next measurement, so it must be rejected at creation (ADR 0008).
        seedProfileAndWeight()
        val alreadyReached = Goal(null, today, 90.0, 86.0, 0.5, active = true)

        val ex = assertThrows<IllegalArgumentException> {
            service.replaceActiveGoal(alreadyReached, today)
        }
        assertTrue(
            ex.message!!.contains("trend", ignoreCase = true),
            "message should name the trend-weight rule, was: ${ex.message}",
        )
    }

    @Test
    fun `replacing a goal deactivates the prior goal and activates the new one`() {
        // Profile + weight so the always-on recompute side effect can run; this test
        // focuses on the deactivate + insert behaviour, not the review it produces.
        seedProfileAndWeight()
        val prior = goals.insert(Goal(null, today.minusMonths(2), 95.0, 85.0, 0.5, active = true))

        val replacement = service.replaceActiveGoal(newGoal(rate = 0.75), today)

        val active = goals.findActive()
        assertNotNull(active)
        assertEquals(replacement.id, active.id)
        assertEquals(0.75, active.rateKgPerWeek)

        // The prior goal is preserved as inactive history.
        val priorReloaded = goals.findAll().single { it.id == prior.id }
        assertEquals(false, priorReloaded.active)
        assertEquals(2, goals.findAll().size)
    }
}
