package com.tucker.persistence

import com.tucker.domain.WeeklyReview
import com.tucker.jooq.Tables.WEEKLY_REVIEW
import com.tucker.jooq.tables.records.WeeklyReviewRecord
import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import java.time.LocalDate

/** Persistence for [WeeklyReview] — the history of the adaptive engine. */
@Repository
class WeeklyReviewRepository(private val dsl: DSLContext) {

    fun latest(): WeeklyReview? =
        dsl.selectFrom(WEEKLY_REVIEW)
            .orderBy(WEEKLY_REVIEW.REVIEWED_ON.desc())
            .limit(1)
            .fetchOne()?.toDomain()

    /** The two most recent reviews, newest first — the inputs to a budget-change diff. */
    fun latestTwo(): List<WeeklyReview> =
        dsl.selectFrom(WEEKLY_REVIEW)
            .orderBy(WEEKLY_REVIEW.REVIEWED_ON.desc())
            .limit(2)
            .fetch().map { it.toDomain() }

    fun findAll(): List<WeeklyReview> =
        dsl.selectFrom(WEEKLY_REVIEW)
            .orderBy(WEEKLY_REVIEW.REVIEWED_ON)
            .fetch().map { it.toDomain() }

    fun insert(review: WeeklyReview): WeeklyReview {
        val rec = dsl.newRecord(WEEKLY_REVIEW)
        rec.reviewedOn = review.reviewedOn.toString()
        rec.trendWeightKg = review.trendWeightKg.toFloat()
        rec.maintenanceKcal = review.maintenanceKcal.toFloat()
        rec.calorieBudgetKcal = review.calorieBudgetKcal.toFloat()
        rec.proteinFloorG = review.proteinFloorG.toFloat()
        rec.note = review.note
        rec.store()
        return review.copy(id = rec.id!!.toLong())
    }

    private fun WeeklyReviewRecord.toDomain(): WeeklyReview = WeeklyReview(
        id = id!!.toLong(),
        reviewedOn = LocalDate.parse(reviewedOn),
        trendWeightKg = trendWeightKg.toDouble(),
        maintenanceKcal = maintenanceKcal.toDouble(),
        calorieBudgetKcal = calorieBudgetKcal.toDouble(),
        proteinFloorG = proteinFloorG.toDouble(),
        note = note,
    )
}
