package com.tucker.persistence

import com.tucker.domain.Maintenance
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

    /**
     * The most recent review dated strictly before [date], if any — the value the
     * engine carries forward when it can't adapt (ADR 0018). Strictly-earlier, not the
     * global latest, so a same-day recompute or a later-dated review can't be held.
     */
    fun latestBefore(date: LocalDate): WeeklyReview? =
        dsl.selectFrom(WEEKLY_REVIEW)
            .where(WEEKLY_REVIEW.REVIEWED_ON.lt(date.toString()))
            .orderBy(WEEKLY_REVIEW.REVIEWED_ON.desc())
            .limit(1)
            .fetchOne()?.toDomain()

    /** The review recorded on [reviewedOn], if one exists — `reviewed_on` is UNIQUE. */
    fun findByReviewedOn(reviewedOn: LocalDate): WeeklyReview? =
        dsl.selectFrom(WEEKLY_REVIEW)
            .where(WEEKLY_REVIEW.REVIEWED_ON.eq(reviewedOn.toString()))
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

    /** Remove the review recorded on [reviewedOn], if any — used to force a recompute. */
    fun deleteByReviewedOn(reviewedOn: LocalDate) {
        dsl.deleteFrom(WEEKLY_REVIEW)
            .where(WEEKLY_REVIEW.REVIEWED_ON.eq(reviewedOn.toString()))
            .execute()
    }

    fun insert(review: WeeklyReview): WeeklyReview {
        val rec = dsl.newRecord(WEEKLY_REVIEW)
        rec.reviewedOn = review.reviewedOn.toString()
        rec.trendWeightKg = review.trendWeightKg.toFloat()
        rec.maintenanceKcal = review.maintenance.kcal.toFloat()
        rec.maintenanceBasis = review.maintenance.basis.name
        rec.calorieBudgetKcal = review.calorieBudgetKcal.toFloat()
        rec.proteinFloorG = review.proteinFloorG.toFloat()
        rec.store()
        return review.copy(id = rec.id!!.toLong())
    }

    private fun WeeklyReviewRecord.toDomain(): WeeklyReview = WeeklyReview(
        id = id!!.toLong(),
        reviewedOn = LocalDate.parse(reviewedOn),
        trendWeightKg = trendWeightKg.toDouble(),
        maintenance = Maintenance(
            kcal = maintenanceKcal.toDouble(),
            basis = Maintenance.Basis.valueOf(maintenanceBasis),
        ),
        calorieBudgetKcal = calorieBudgetKcal.toDouble(),
        proteinFloorG = proteinFloorG.toDouble(),
    )
}
