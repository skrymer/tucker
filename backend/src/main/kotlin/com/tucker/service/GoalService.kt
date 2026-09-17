package com.tucker.service

import com.tucker.api.InvalidFieldException
import com.tucker.domain.Goal
import com.tucker.domain.IntakeTargets
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
     * The **start weight is derived here** as the Trend Weight standing on
     * [startedOn] (ADR 0016) — the client can't compute the EWMA, and anchoring on
     * the trend makes a fresh Goal read 0% (start == now). For a Goal started today
     * that is normally the live trend; it differs for a backdated start — where
     * anchoring on today's would hand the plan a run of loss already banked, so it
     * reads as near-target from its first day — and for a reading dated ahead of
     * the start, which ADR 0014's ±1 tolerance admits across two devices.
     * A start before the first reading anchors on the earliest point instead, the
     * first thing known about this body; with no reading at all there is no trend,
     * so the Goal can't be anchored and is rejected.
     *
     * The **target** is guarded twice, because the two figures part exactly when the
     * anchor does: at or above the **live** trend the Goal is already reached, and at
     * or above the **anchor** the plan would run upward from where it began. Both name
     * `targetWeightKg`, so whichever refuses reaches the input the User typed it into.
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
        val trend = WeightTrend.from(weights.findAll())
        val trendKg = trend.latest()?.trendKg
            ?: throw IllegalArgumentException("log your weight before setting a goal")
        refuseTargetNotBelowTrend(targetWeightKg, trendKg)
        // standingOn is null only for a start before the first reading, and latest()
        // above proved there is one, so earliest() always answers.
        val anchorKg = requireNotNull(trend.standingOn(startedOn) ?: trend.earliest()).trendKg
        refuseTargetNotBelowAnchor(targetWeightKg, anchorKg)
        val goal = Goal.started(
            startedOn = startedOn,
            startWeightKg = anchorKg,
            targetWeightKg = targetWeightKg,
            rateKgPerWeek = rateKgPerWeek,
            today = today,
        )
        refuseRateOutrunningMaintenance(goal, today)
        goals.deactivateAll()
        val saved = goals.insert(goal)
        weeklyReview.recomputeFor(today)
        return saved
    }

    /**
     * The target sits below the weight the Goal starts from — the same rule [Goal]'s
     * own invariant states, said here so the refusal names the input the User typed
     * it into. The two guards are one figure whenever the anchor is the live trend,
     * which is the usual case and not a guarantee: a reading dated after the start
     * parts them with no backdating at all (ADR 0014's ±1 across two devices). A
     * bare invariant failure would then reach the form as though no field were at
     * fault, having just previewed a start weight the User was never refused against.
     */
    private fun refuseTargetNotBelowAnchor(targetWeightKg: Double, anchorKg: Double) {
        if (targetWeightKg >= anchorKg) {
            throw InvalidFieldException(
                field = "targetWeightKg",
                message = "a weight-loss Goal needs a target below the weight it starts from " +
                    "(${"%.1f".format(anchorKg)} kg)",
            )
        }
    }

    /** The target sits below the live trend, or the Goal is already reached (ADR 0016). */
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
        if (IntakeTargets.deficitApplies(maintenance, goal)) return
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
