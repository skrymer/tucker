package com.tucker.service

import com.tucker.domain.WeightMeasurement
import com.tucker.persistence.WeeklyReviewRepository
import com.tucker.persistence.WeightMeasurementRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate

/**
 * Application logic for recording or removing a [WeightMeasurement]. A measurement
 * write is the only moment the smoothed Trend Weight can move, so it is also the one
 * place a Goal can cross its target — after each write we stamp the active Goal as
 * reached if it just crossed (ADR 0008). Both run in one transaction.
 *
 * The first reading after every reading was deleted force-recomputes today's review:
 * the review held then stands on no reading at all, and a Calorie Tracking change
 * made meanwhile could not recompute it, so it must not stand again. A User's
 * first-ever reading has no review held, and catch-up bootstraps theirs.
 */
@Service
class WeightMeasurementService(
    private val weights: WeightMeasurementRepository,
    private val goals: GoalService,
    private val weeklyReview: WeeklyReviewService,
    private val reviews: WeeklyReviewRepository,
) {

    @Transactional
    fun save(measurement: WeightMeasurement, today: LocalDate): WeightMeasurement {
        val firstReading = !weights.any()
        val saved = weights.save(measurement)
        goals.stampReachedIfCrossed(today)
        if (firstReading && heldReviewCanBeRecomputed()) weeklyReview.recomputeFor(today)
        return saved
    }

    private fun heldReviewCanBeRecomputed(): Boolean =
        reviews.latestReviewedOn() != null && weeklyReview.setupComplete()

    @Transactional
    fun delete(id: Long, today: LocalDate) {
        weights.deleteById(id)
        goals.stampReachedIfCrossed(today)
    }
}
