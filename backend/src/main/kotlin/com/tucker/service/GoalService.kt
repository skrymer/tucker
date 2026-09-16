package com.tucker.service

import com.tucker.api.InvalidFieldException
import com.tucker.domain.Goal
import com.tucker.domain.WeightTrend
import com.tucker.persistence.GoalRepository
import com.tucker.persistence.WeightMeasurementRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate

/** Application logic for Goals — chiefly, replacing the active Goal atomically. */
@Service
class GoalService(
    private val goals: GoalRepository,
    private val weights: WeightMeasurementRepository,
    private val weeklyReview: WeeklyReviewService,
) {

    /**
     * Create a Goal, make it the single active one, and force-recompute today's
     * [com.tucker.domain.WeeklyReview] so the new deficit (and therefore the Calorie
     * Budget and Protein Floor) takes effect immediately rather than waiting up to a
     * week for the next review cadence.
     *
     * The **start weight is derived here** as the live Trend Weight at creation
     * (ADR 0016) — the client can't compute the EWMA, and anchoring on the trend
     * makes a fresh Goal read 0% (start == now). It's computed once and reused as
     * both the anchor and the target guard: a target at or above the trend is
     * already-reached and rejected. With no reading there is no trend, so the Goal
     * can't be anchored and is rejected.
     *
     * A deliberate Goal change is one of the few moments the Budget is allowed to
     * move mid-week — clock-driven ticks still hold it steady. The recompute
     * *overwrites* any same-day review (see [WeeklyReviewService.recomputeFor]), and
     * on a fresh install it mints today's first one. Direct call rather than a
     * domain event: single consumer, and we want the save and review committed in
     * one transaction.
     */
    @Transactional
    fun createGoal(
        startedOn: LocalDate,
        targetWeightKg: Double,
        rateKgPerWeek: Double,
        today: LocalDate,
    ): Goal {
        val trendKg = currentTrendKg()
            ?: throw IllegalArgumentException("log your weight before setting a goal")
        refuseTargetNotBelowTrend(targetWeightKg, trendKg)
        val goal = Goal(
            id = null,
            startedOn = startedOn,
            startWeightKg = trendKg,
            targetWeightKg = targetWeightKg,
            rateKgPerWeek = rateKgPerWeek,
            active = true,
        )
        refuseRateOutrunningMaintenance(goal, today)
        goals.deactivateAll()
        val saved = goals.insert(goal)
        weeklyReview.recomputeFor(today)
        return saved
    }

    /** The target sits below the live trend the Goal anchors its start on (ADR 0016). */
    private fun refuseTargetNotBelowTrend(targetWeightKg: Double, trendKg: Double) {
        if (targetWeightKg >= trendKg) {
            throw InvalidFieldException(
                field = "targetWeightKg",
                message = "a weight-loss Goal needs a target below your current trend weight " +
                    "(${"%.1f".format(trendKg)} kg)",
            )
        }
    }

    /**
     * A rate is refused while the User still has the control in their hand
     * (ADR 0030) — a running Goal that Maintenance later falls under has its deficit
     * suspended instead. No Maintenance is a User whose reviews derive none, so
     * there is no Calorie Budget for a rate to outrun.
     *
     * It suggests no rate: the fastest that would fit leaves a fraction of a
     * calorie, so naming it would be the invented floor arriving as copy.
     */
    private fun refuseRateOutrunningMaintenance(goal: Goal, today: LocalDate) {
        val maintenance = weeklyReview.maintenanceFor(today) ?: return
        if (goal.deficitFitsWithin(maintenance.kcal)) return
        throw InvalidFieldException(
            field = "rateKgPerWeek",
            message = "at your current maintenance of " +
                "${"%.0f".format(maintenance.kcal)} kcal a day, " +
                "${plainRate(goal.rateKgPerWeek)} kg a week would leave you nothing to eat " +
                "— choose a slower rate",
        )
    }

    /**
     * Stamp the active Goal as *reached* if the live Trend Weight has crossed its
     * target (ADR 0008). Called on a Weight-Measurement write — the only moment the
     * trend can move. Reaching latches: an already-reached Goal is left untouched, so
     * the surfaced banner doesn't flicker. A no-op when no Goal is active or no
     * measurements exist yet.
     */
    @Transactional
    fun stampReachedIfCrossed(today: LocalDate) {
        val goal = goals.findActive() ?: return
        val trendKg = currentTrendKg() ?: return
        val stamped = goal.markReachedIfCrossed(trendKg, today)
        if (stamped.reachedOn != null && stamped.reachedOn != goal.reachedOn) {
            goals.updateReachedOn(requireNotNull(goal.id), stamped.reachedOn)
        }
    }

    /**
     * A rate as the User typed it — "1.5", not "1.50" — so the refusal quotes their
     * own figure back rather than a re-decimalised one.
     */
    private fun plainRate(rateKgPerWeek: Double): String =
        "%.2f".format(rateKgPerWeek).trimEnd('0').trimEnd('.')

    /** The live Trend Weight — the latest EWMA point, or null before any reading. */
    private fun currentTrendKg(): Double? =
        WeightTrend.from(weights.findAll()).latest()?.trendKg

    /**
     * Switch to Maintenance Mode: deactivate the active Goal (if any) and
     * force-recompute today's review so the Budget lifts to Maintenance immediately
     * (ADR 0008) rather than waiting up to a week. A no-op when no Goal is active.
     */
    @Transactional
    fun deactivateActiveGoal(today: LocalDate) {
        if (goals.findActive() == null) return
        goals.deactivateAll()
        weeklyReview.recomputeFor(today)
    }
}
