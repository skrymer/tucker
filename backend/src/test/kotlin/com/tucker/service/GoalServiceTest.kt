package com.tucker.service

import com.tucker.api.InvalidFieldException
import com.tucker.domain.Goal
import com.tucker.domain.Profile
import com.tucker.domain.Sex
import com.tucker.domain.WeightMeasurement
import com.tucker.domain.targets
import com.tucker.persistence.GoalRepository
import com.tucker.persistence.ProfileRepository
import com.tucker.persistence.WeeklyReviewRepository
import com.tucker.persistence.WeightMeasurementRepository
import com.tucker.security.WithTuckerUser
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
@WithTuckerUser
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

    /**
     * Seed a trend just above [trendAbove] then return the active Goal (target
     * [target]), so a later crossing measurement can be added. EWMA weights each
     * reading 10%, so a single low reading after this nudges the trend across.
     */
    private fun seedActiveGoalWithTrendAbove(trendAbove: Double, target: Double): Goal {
        weights.save(WeightMeasurement.recorded(today.minusDays(1), trendAbove, today))
        return goals.insert(Goal(null, today, 90.0, target, 0.5, active = true))
    }

    @Test
    fun `a goal anchors on the live trend whatever date it is stamped with`() {
        profiles.save(Profile(Sex.MALE, LocalDate.of(1986, 5, 22), 180.0))
        // 90 kg a fortnight back, 80 kg today. A fortnight of decay puts the live
        // trend at 82.29 while the first trend point is still 90.0 — two figures far
        // enough apart to tell apart.
        weights.save(WeightMeasurement.recorded(today.minusDays(14), 90.0, today))
        weights.save(WeightMeasurement.recorded(today, 80.0, today))

        // Stamped a week before anything was weighed, so the trend stands nowhere
        // on it: the rule reverted here fell back to the earliest point, 90.0.
        val goal = service.createGoal(today.minusDays(21), 70.0, 0.5, today)

        // A Goal begins when it is set, so its start weight is where the User stands
        // then (ADR 0016). The start date says when the plan runs from, and is not
        // what the anchor is looked up by — nothing in the product backdates a Goal,
        // and a date reached through ADR 0014's tolerance must not move the figure
        // the form previewed.
        assertEquals(82.2876792454961, goal.startWeightKg, 1e-9)
    }

    @Test
    fun `a goal set from a device a day behind anchors on the live trend, not the older point`() {
        profiles.save(Profile(Sex.MALE, LocalDate.of(1986, 5, 22), 180.0))
        // The shape two timezones produce and the app really reaches: a phone east
        // of UTC stamps a weigh-in on its own today, and the Goal is then set from a
        // device still on the previous day, which ADR 0014's +/-1 tolerance admits.
        weights.save(WeightMeasurement.recorded(today.minusDays(5), 90.0, today))
        weights.save(WeightMeasurement.recorded(today, 80.0, today))

        val goal = service.createGoal(today.minusDays(1), 70.0, 0.5, today.minusDays(1))

        // 85.90 is the live trend, which is what the form previewed and validated
        // against (ADR 0016). The 90.0 standing on the stamped start date is a
        // figure the User was never shown, and would read as >0% done on day one.
        assertEquals(85.9049, goal.startWeightKg, 1e-9)
    }

    @Test
    fun `stamps the active goal as reached when a measurement crosses the target`() {
        // Trend sits at 80.4; a 76.0 reading pulls the EWMA to ~79.96, below the 80 target.
        seedActiveGoalWithTrendAbove(trendAbove = 80.4, target = 80.0)

        weights.save(WeightMeasurement.recorded(today, 76.0, today))
        service.stampReachedIfCrossed(today)

        assertEquals(today, goals.findActive()!!.reachedOn)
    }

    @Test
    fun `a weekly weigher reaches their goal when their body does`() {
        // Weighed once at 80.4 and again a week later at 78.0, against an 80.0 target.
        // A week of decay carries the trend to 79.14, so ADR 0008's fork on Today opens
        // now. Decayed a tenth per *reading* it would stand at 80.16 and stay above the
        // target for another two months of weighing (ADR 0032).
        weights.save(WeightMeasurement.recorded(today.minusDays(7), 80.4, today))
        goals.insert(Goal(null, today.minusDays(7), 90.0, 80.0, 0.5, active = true))

        weights.save(WeightMeasurement.recorded(today, 78.0, today))
        service.stampReachedIfCrossed(today)

        assertEquals(today, goals.findActive()!!.reachedOn)
    }

    @Test
    fun `does not restamp reachedOn when a later measurement crosses again`() {
        seedActiveGoalWithTrendAbove(trendAbove = 80.4, target = 80.0)
        weights.save(WeightMeasurement.recorded(today, 76.0, today))
        service.stampReachedIfCrossed(today)

        // A week later, still under target — the latch must keep the first date.
        val later = today.plusDays(7)
        weights.save(WeightMeasurement.recorded(later, 75.0, later))
        service.stampReachedIfCrossed(later)

        assertEquals(today, goals.findActive()!!.reachedOn)
    }

    @Test
    fun `the first goal on a fresh install fires the first weekly review`() {
        seedProfileAndWeight()

        service.createGoal(today, 80.0, 0.5, today)

        val review = reviews.latest()
        assertNotNull(review, "expected a weekly review to have been fired")
        assertEquals(today, review.reviewedOn)
    }

    @Test
    fun `replacing a goal recomputes today's review for the new goal's deficit`() {
        seedProfileAndWeight()
        // An existing plan, with today's review already reflecting its slower rate.
        service.createGoal(today, 80.0, 0.5, today)
        val before = reviews.findByReviewedOn(today)!!.targets.calorieBudgetKcal

        // Replace it with a steeper rate — a deliberate Goal change.
        service.createGoal(today, 80.0, 0.75, today)

        // Today's review is recomputed in place: same maintenance, larger deficit, so
        // the Budget drops immediately rather than waiting for the weekly cadence.
        val after = reviews.findByReviewedOn(today)!!.targets.calorieBudgetKcal
        val extraDeficit = (0.75 - 0.5) * Goal.KCAL_PER_KG_FAT / Goal.DAYS_PER_WEEK
        assertEquals(before - extraDeficit, after, 0.5)
        assertEquals(1, reviews.findAll().size)
    }

    @Test
    fun `deactivating the active goal switches to maintenance and recomputes today's review`() {
        seedProfileAndWeight()
        service.createGoal(today, 80.0, 0.5, today)
        val cutBudget = reviews.findByReviewedOn(today)!!.targets.calorieBudgetKcal

        service.deactivateActiveGoal(today)

        // No Goal is active any more — the user is maintaining.
        assertNull(goals.findActive())
        // Today's review is recomputed in place to the Maintenance budget (no deficit),
        // so it lifts above the cut budget rather than waiting for the weekly cadence.
        val review = reviews.findByReviewedOn(today)!!
        assertEquals(review.targets.maintenance.kcal, review.targets.calorieBudgetKcal, 1e-9)
        assertEquals(cutBudget + newGoal(rate = 0.5).dailyDeficitKcal(), review.targets.calorieBudgetKcal, 0.5)
        assertEquals(1, reviews.findAll().size)
    }

    @Test
    fun `rejects a goal whose target is not below the current trend weight`() {
        // The latest reading is 86.0, so the Trend Weight — and thus the derived
        // start weight (ADR 0016) — is 86.0. A target of 86 equals the trend, so the
        // Goal is already-reached and is rejected at creation, naming the rule.
        seedProfileAndWeight()

        val ex = assertThrows<InvalidFieldException> {
            service.createGoal(today, 86.0, 0.5, today)
        }
        // The refusal names the input the User typed it into. `Goal`'s own
        // `target < startWeight` invariant would refuse this too, but as a bare
        // IllegalArgumentException carrying no field — which the Goal form shows
        // above the submit as though no input were at fault.
        assertEquals("targetWeightKg", ex.field)
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

        val replacement = service.createGoal(today, 80.0, 0.75, today)

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
