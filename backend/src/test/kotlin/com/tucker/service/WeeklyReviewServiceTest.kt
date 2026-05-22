package com.tucker.service

import com.tucker.domain.EstimatedEntry
import com.tucker.domain.Goal
import com.tucker.domain.Maintenance
import com.tucker.domain.Profile
import com.tucker.domain.Sex
import com.tucker.domain.WeightMeasurement
import com.tucker.persistence.EntryRepository
import com.tucker.persistence.GoalRepository
import com.tucker.persistence.ProfileRepository
import com.tucker.persistence.WeightMeasurementRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@SpringBootTest
@Transactional
class WeeklyReviewServiceTest {

    @Autowired lateinit var service: WeeklyReviewService
    @Autowired lateinit var weights: WeightMeasurementRepository
    @Autowired lateinit var entries: EntryRepository
    @Autowired lateinit var profiles: ProfileRepository
    @Autowired lateinit var goals: GoalRepository

    private val today = LocalDate.of(2026, 5, 22)

    private fun seedProfileAndGoal() {
        profiles.save(Profile(Sex.MALE, LocalDate.of(1986, 5, 22), 180.0))
        goals.insert(Goal(null, today.minusMonths(1), 90.0, 80.0, 0.5, active = true))
    }

    @Test
    fun `with little history the review uses the formula seed`() {
        seedProfileAndGoal()
        weights.save(WeightMeasurement(null, today.minusDays(1), 86.0))
        weights.save(WeightMeasurement(null, today, 85.8))

        val review = service.runReview(today)

        assertTrue(review.note!!.contains(Maintenance.Basis.FORMULA_SEED.name))
        assertTrue(review.maintenanceKcal > 0)
        // Budget = maintenance - the deficit implied by 0.5 kg/week (~550 kcal).
        assertEquals(review.maintenanceKcal - 0.5 * 7700.0 / 7.0, review.calorieBudgetKcal, 0.5)
        // Protein floor = 2 g per kg of trend weight.
        assertEquals(2.0 * review.trendWeightKg, review.proteinFloorG, 0.01)
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

        assertTrue(review.note!!.contains(Maintenance.Basis.ADAPTIVE.name))
        assertTrue(review.maintenanceKcal > 0)
        assertTrue(review.calorieBudgetKcal > 0)
    }
}
