package com.tucker.persistence

import com.tucker.domain.IntakeTargets
import com.tucker.domain.Maintenance
import com.tucker.domain.WeeklyReview
import com.tucker.jooq.Tables.WEEKLY_REVIEW
import com.tucker.jooq.tables.records.WeeklyReviewRecord
import com.tucker.security.CurrentUser
import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import java.time.LocalDate

/**
 * Persistence for [WeeklyReview] — the history of the adaptive engine, one
 * history per User (ADR 0021). Scoped implicitly, so no method here takes an
 * owner.
 *
 * This is where a leak is hardest to see. A review carries no name — only a
 * trend weight, a Maintenance figure, a Budget and a Floor — so reading somebody
 * else's produces no wrong label anywhere, just numbers that are wrong for both
 * people. And because the engine treats a review as idempotent *by date*, an
 * unscoped lookup does not collide on the shared date: it returns the review
 * that is already there and calls it yours.
 */
@Repository
class WeeklyReviewRepository(
    private val dsl: DSLContext,
    private val currentUser: CurrentUser,
) {

    fun latest(): WeeklyReview? =
        dsl.selectFrom(WEEKLY_REVIEW)
            .where(WEEKLY_REVIEW.USER_ID.eq(currentUser.ownerId))
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
            .and(WEEKLY_REVIEW.USER_ID.eq(currentUser.ownerId))
            .orderBy(WEEKLY_REVIEW.REVIEWED_ON.desc())
            .limit(1)
            .fetchOne()?.toDomain()

    /**
     * The most recent review dated strictly before [date] that carries Intake
     * Targets. Distinct from [latestBefore] only across a Calorie-Tracking gap,
     * which is exactly where the engine has to tell a toggle from a stretch.
     */
    fun latestWithTargetsBefore(date: LocalDate): WeeklyReview? =
        dsl.selectFrom(WEEKLY_REVIEW)
            .where(WEEKLY_REVIEW.REVIEWED_ON.lt(date.toString()))
            .and(WEEKLY_REVIEW.USER_ID.eq(currentUser.ownerId))
            .and(WEEKLY_REVIEW.MAINTENANCE_KCAL.isNotNull)
            .orderBy(WEEKLY_REVIEW.REVIEWED_ON.desc())
            .limit(1)
            .fetchOne()?.toDomain()

    /** The caller's review recorded on [reviewedOn], if one exists — unique per User. */
    fun findByReviewedOn(reviewedOn: LocalDate): WeeklyReview? =
        dsl.selectFrom(WEEKLY_REVIEW)
            .where(WEEKLY_REVIEW.REVIEWED_ON.eq(reviewedOn.toString()))
            .and(WEEKLY_REVIEW.USER_ID.eq(currentUser.ownerId))
            .fetchOne()?.toDomain()

    /** The two most recent reviews, newest first — the inputs to a budget-change diff. */
    fun latestTwo(): List<WeeklyReview> =
        dsl.selectFrom(WEEKLY_REVIEW)
            .where(WEEKLY_REVIEW.USER_ID.eq(currentUser.ownerId))
            .orderBy(WEEKLY_REVIEW.REVIEWED_ON.desc())
            .limit(2)
            .fetch().map { it.toDomain() }

    fun findAll(): List<WeeklyReview> =
        dsl.selectFrom(WEEKLY_REVIEW)
            .where(WEEKLY_REVIEW.USER_ID.eq(currentUser.ownerId))
            .orderBy(WEEKLY_REVIEW.REVIEWED_ON)
            .fetch().map { it.toDomain() }

    /** Remove the caller's review recorded on [reviewedOn], so it is recomputed. */
    fun deleteByReviewedOn(reviewedOn: LocalDate) {
        dsl.deleteFrom(WEEKLY_REVIEW)
            .where(WEEKLY_REVIEW.REVIEWED_ON.eq(reviewedOn.toString()))
            .and(WEEKLY_REVIEW.USER_ID.eq(currentUser.ownerId))
            .execute()
    }

    fun insert(review: WeeklyReview): WeeklyReview {
        val rec = dsl.newRecord(WEEKLY_REVIEW)
        rec.userId = currentUser.ownerId
        rec.reviewedOn = review.reviewedOn.toString()
        rec.trendWeightKg = review.trendWeightKg
        rec.writeTargets(review.intakeTargets)
        rec.store()
        return review.copy(id = rec.id!!.toLong())
    }
}

/**
 * Write the four target columns from one branch. They are one value object,
 * and V15's CHECK holds them to it, so a row is never assembled by asking
 * four times whether there are targets.
 */
private fun WeeklyReviewRecord.writeTargets(targets: IntakeTargets?) {
    maintenanceKcal = targets?.maintenance?.kcal
    maintenanceBasis = targets?.maintenance?.basis?.name
    calorieBudgetKcal = targets?.calorieBudgetKcal
    proteinFloorG = targets?.proteinFloorG
}

private fun WeeklyReviewRecord.toDomain(): WeeklyReview = WeeklyReview(
    id = id!!.toLong(),
    reviewedOn = LocalDate.parse(reviewedOn),
    trendWeightKg = trendWeightKg,
    intakeTargets = readTargets(),
)

/**
 * The mirror of [writeTargets]: one column answers for all four, because the
 * CHECK makes "some present, some not" a row the database will not hold.
 */
private fun WeeklyReviewRecord.readTargets(): IntakeTargets? {
    val kcal = maintenanceKcal ?: return null
    return IntakeTargets(
        maintenance = Maintenance(kcal = kcal, basis = Maintenance.Basis.valueOf(maintenanceBasis)),
        calorieBudgetKcal = calorieBudgetKcal,
        proteinFloorG = proteinFloorG,
    )
}
