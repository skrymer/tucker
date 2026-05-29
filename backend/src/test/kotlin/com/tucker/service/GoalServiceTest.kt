package com.tucker.service

import com.tucker.domain.Goal
import com.tucker.domain.Profile
import com.tucker.domain.Sex
import com.tucker.domain.WeeklyReview
import com.tucker.domain.WeightMeasurement
import com.tucker.persistence.GoalRepository
import com.tucker.persistence.ProfileRepository
import com.tucker.persistence.WeeklyReviewRepository
import com.tucker.persistence.WeightMeasurementRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

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
    fun `replacing a goal does not re-run the review when one already exists`() {
        seedProfileAndWeight()
        val priorReviewedOn = today.minusWeeks(1)
        reviews.insert(
            WeeklyReview(
                id = null,
                reviewedOn = priorReviewedOn,
                trendWeightKg = 86.0,
                maintenanceKcal = 2400.0,
                calorieBudgetKcal = 1850.0,
                proteinFloorG = 172.0,
                note = "seed",
            ),
        )

        service.replaceActiveGoal(newGoal(rate = 0.75), today)

        // The latest review is still the pre-existing one — no new review fired.
        assertEquals(priorReviewedOn, reviews.latest()!!.reviewedOn)
        assertEquals(1, reviews.findAll().size)
    }

    @Test
    fun `replacing a goal deactivates the prior goal and activates the new one`() {
        // A prior review already exists, so this test isolates the deactivate +
        // insert behaviour from the first-review side effect.
        reviews.insert(
            WeeklyReview(null, today.minusWeeks(1), 86.0, 2400.0, 1850.0, 172.0, "seed"),
        )
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
