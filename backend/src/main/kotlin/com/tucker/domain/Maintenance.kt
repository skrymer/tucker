package com.tucker.domain

import java.time.LocalDate

/**
 * An estimate of Maintenance — the daily calories that hold weight steady (TDEE).
 * Seeded from the Mifflin-St Jeor formula, then corrected from logged data once
 * enough history exists.
 */
data class Maintenance(
    val kcal: Double,
    val basis: Basis,
    val heldReason: HeldReason? = null,
) {
    /** How a Maintenance figure was derived. */
    enum class Basis { FORMULA_SEED, ADAPTIVE, HELD }

    /**
     * Why a [Basis.HELD] figure was carried forward instead of corrected — so the
     * badge can name the one thing that would lift it (ADR 0031). Each names what
     * the engine *found*, never what it concluded from it.
     */
    enum class HeldReason {
        /**
         * The window's Entries cannot carry an average: too few days hold one, or the
         * days that do hold no calories. Both are the same ask — log more of the food
         * you eat — which is why they are one reason rather than two.
         */
        THIN_LOG,

        /** No day in the window carries a Weight Measurement — weigh in once. */
        UNWEIGHED_WINDOW,

        /**
         * No reading on or before the window's start, so there is nothing to measure
         * a change *from* — a User weighing daily has this until their history reaches
         * back a fortnight. Waiting is the remedy, not weighing more.
         */
        NO_WINDOW_ANCHOR,

        /**
         * The balance came out under the body's basal rate, so the window's log and its
         * Weight Measurements disagree. Which of them is wrong is *not* recorded: an
         * incomplete log is the likeliest cause and not the only one, since a trend
         * built from few readings understates a real fall (ADR 0018's #292 amendment).
         */
        BELOW_BASAL_RATE,
    }

    init {
        require(kcal > 0) { "maintenance kcal must be > 0, was $kcal" }
        // One-directional on purpose: a reason implies a hold, but a hold need not
        // carry one — reviews written before Tucker recorded it are hydrated as they
        // were, and do not get a reason invented for them (ADR 0031).
        require(basis == Basis.HELD || heldReason == null) {
            "only a held maintenance has a reason, was $basis with $heldReason"
        }
    }

    companion object {
        /** Default activity multiplier for the formula seed (lightly active). */
        const val SEED_ACTIVITY_FACTOR = 1.4

        /** The formula seed: Mifflin-St Jeor BMR x an activity factor. */
        fun seed(profile: Profile, weightKg: Double, on: LocalDate): Maintenance =
            Maintenance(
                kcal = profile.basalMetabolicRateKcal(weightKg, on) * SEED_ACTIVITY_FACTOR,
                basis = Basis.FORMULA_SEED,
            )

        /**
         * The adaptive estimate over a window of [windowDays], as an energy balance:
         * average daily intake plus the energy equivalent of the Trend Weight change.
         * If the trend fell, the user ate below maintenance — so maintenance is the
         * intake plus that shortfall.
         *
         * The two terms divide by different denominators on purpose (ADR 0018): intake
         * by [loggedDays] (the days that actually carry an Entry, so an unlogged day
         * isn't a phantom zero-calorie day that drags the average down), and
         * [trendChange] by every calendar day it was observed across, logged or not,
         * because the scale integrated the real eating on the unlogged ones regardless.
         *
         * Never by fewer than [windowDays] though: evidence about less than the window
         * is not evidence about the window.
         *
         * Null where the balance lands below [basalMetabolicRateKcal]: expenditure is
         * the basal rate times an activity factor of at least 1.2, so a figure beneath
         * it is impossible rather than merely low, and the window's log and its Weight
         * Measurements are contradicting each other (ADR 0031).
         */
        fun adaptive(
            totalIntakeKcal: Double,
            loggedDays: Int,
            trendChange: WeightTrend.Change,
            windowDays: Long,
            basalMetabolicRateKcal: Double,
        ): Maintenance? {
            require(loggedDays > 0) { "loggedDays must be > 0, was $loggedDays" }
            require(windowDays > 0) { "windowDays must be > 0, was $windowDays" }
            val divisorDays = maxOf(trendChange.overDays, windowDays)
            val energyFromWeightChange = -trendChange.kg * Goal.KCAL_PER_KG_FAT / divisorDays
            val kcal = totalIntakeKcal / loggedDays + energyFromWeightChange
            return if (isMeasurable(kcal, basalMetabolicRateKcal)) {
                Maintenance(kcal = kcal, basis = Basis.ADAPTIVE)
            } else {
                null
            }
        }

        /**
         * Whether [kcal] can be a body's expenditure at all (ADR 0031).
         *
         * Subsumes the `init` requirement rather than sitting above it: nothing bounds
         * [Profile.basalMetabolicRateKcal] from below, so a height entered in metres
         * yields a negative one, and a gate asking only about the rate would then admit
         * the negative balance it exists to refuse.
         */
        private fun isMeasurable(kcal: Double, basalMetabolicRateKcal: Double): Boolean =
            kcal >= basalMetabolicRateKcal && kcal > 0

        /**
         * Carry a prior Maintenance figure forward unchanged, because [reason] stopped
         * the correction being trustworthy (ADR 0018, ADR 0031). Reviews written before
         * Tucker recorded a reason hydrate through the constructor instead, and carry
         * null — which is why the `init` requirement is one-directional.
         */
        fun held(kcal: Double, reason: HeldReason): Maintenance =
            Maintenance(kcal, Basis.HELD, reason)
    }
}
