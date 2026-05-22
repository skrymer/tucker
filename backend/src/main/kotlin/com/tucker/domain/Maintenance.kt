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
    enum class Basis { FORMULA_SEED, ADAPTIVE }

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
         * The adaptive estimate over a window: average daily intake adjusted by
         * the energy equivalent of the Trend Weight change. If the trend fell,
         * the user ate below maintenance — so maintenance is the intake plus that
         * shortfall.
         */
        fun adaptive(
            averageDailyIntakeKcal: Double,
            trendWeightChangeKg: Double,
            days: Int,
        ): Maintenance {
            require(days > 0) { "days must be > 0, was $days" }
            val energyFromWeightChange = -trendWeightChangeKg * Goal.KCAL_PER_KG_FAT / days
            return Maintenance(
                kcal = averageDailyIntakeKcal + energyFromWeightChange,
                basis = Basis.ADAPTIVE,
            )
        }
    }
}
