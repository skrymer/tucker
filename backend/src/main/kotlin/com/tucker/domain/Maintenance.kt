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
) {
    /** How a Maintenance figure was derived. */
    enum class Basis { FORMULA_SEED, ADAPTIVE, HELD }

    init {
        require(kcal > 0) { "maintenance kcal must be > 0, was $kcal" }
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
         * The adaptive estimate over a window, as an energy balance: average daily
         * intake plus the energy equivalent of the Trend Weight change. If the trend
         * fell, the user ate below maintenance — so maintenance is the intake plus
         * that shortfall.
         *
         * The two terms divide by different denominators on purpose (ADR 0018):
         * intake by [loggedDays] (the days that actually carry an Entry, so an
         * unlogged day isn't a phantom zero-calorie day that drags the average down),
         * while the weight change is spread over the full [windowDays] — the scale
         * integrated the real eating on the unlogged days regardless.
         */
        fun adaptive(
            totalIntakeKcal: Double,
            loggedDays: Int,
            trendWeightChangeKg: Double,
            windowDays: Int,
        ): Maintenance {
            require(loggedDays > 0) { "loggedDays must be > 0, was $loggedDays" }
            require(windowDays > 0) { "windowDays must be > 0, was $windowDays" }
            val energyFromWeightChange = -trendWeightChangeKg * Goal.KCAL_PER_KG_FAT / windowDays
            return Maintenance(
                kcal = totalIntakeKcal / loggedDays + energyFromWeightChange,
                basis = Basis.ADAPTIVE,
            )
        }

        /** Carry a prior Maintenance figure forward unchanged — used below the coverage floor (ADR 0018). */
        fun held(kcal: Double): Maintenance = Maintenance(kcal, Basis.HELD)
    }
}
