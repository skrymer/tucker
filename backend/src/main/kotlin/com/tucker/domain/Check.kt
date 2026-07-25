package com.tucker.domain

/**
 * A Check (CONTEXT.md, ADR 0022): what a product costs and returns against the
 * user's own targets, taken *before* eating or buying it.
 *
 * Every figure is a share of the **whole** Calorie Budget and Protein Floor, never
 * of what today has left, so the same product reads the same at 9am and 8pm. The
 * shares are stated per 100 g; both scale linearly with grams, so the client
 * scales them to a portion without re-deriving anything.
 *
 * A Check states figures and stops — it never labels a Food good or bad.
 */
data class Check(
    /** The whole-day targets this Check is measured against. */
    val calorieBudgetKcal: Double,
    val proteinFloorG: Double,
    /** What 100 g costs, as a share of the Calorie Budget. */
    val costSharePer100g: Double,
    /** What 100 g returns, as a share of the Protein Floor. */
    val returnSharePer100g: Double,
    /** The pace the user's own targets imply — the line the Food's own figure sits against. */
    val pace: Pace,
    /** The Food's own protein per 100 kcal — the figure pace is the line for. */
    val proteinPer100Kcal: Double?,
    /**
     * The protein 100 g of this Food leaves the rest of the day to make up: what
     * its calories would have to carry to keep pace, less what it actually brings.
     * Zero for a Food at or above pace, which carries its own weight.
     */
    val balanceProteinPer100gG: Double,
    /** The most of this Food that fits a whole Calorie Budget. */
    val gramsInBudget: Double?,
    /** How far short of the Protein Floor a whole day of only this Food would land. */
    val wholeDayProteinShortfallG: Double?,
) {
    companion object {
        /** The Check of [nutrition] against a day's [calorieBudgetKcal] and [proteinFloorG]. */
        fun of(nutrition: Nutrition, calorieBudgetKcal: Double, proteinFloorG: Double): Check {
            // Every figure a Check states is a share of one of these two, so both
            // are divisors. A zero Floor is what WeeklyReview permits but the
            // adaptive engine never produces — guard it here rather than let a
            // hand-written row turn the return share into an Infinity on the wire.
            require(calorieBudgetKcal > 0) { "a Check needs a Calorie Budget > 0, was $calorieBudgetKcal" }
            require(proteinFloorG > 0) { "a Check needs a Protein Floor > 0, was $proteinFloorG" }
            val pace = Pace.from(calorieBudgetKcal = calorieBudgetKcal, proteinFloorG = proteinFloorG)
            val gramsInBudget = nutrition.gramsFor(calorieBudgetKcal)
            // A Food above pace has a surplus, not a debt: the day is not obliged to
            // eat less protein elsewhere, so the gap floors at zero.
            val balancePer100g =
                (pace.proteinNeededFor(nutrition.caloriesPer100g) - nutrition.proteinPer100g)
                    .coerceAtLeast(0.0)
            return Check(
                calorieBudgetKcal = calorieBudgetKcal,
                proteinFloorG = proteinFloorG,
                costSharePer100g = nutrition.caloriesPer100g / calorieBudgetKcal,
                returnSharePer100g = nutrition.proteinPer100g / proteinFloorG,
                pace = pace,
                proteinPer100Kcal = nutrition.proteinPer100Kcal(),
                balanceProteinPer100gG = balancePer100g,
                gramsInBudget = gramsInBudget,
                // The whole-day shortfall is that same debt at a whole day's scale —
                // one quantity, stated per 100 g and per Budget.
                wholeDayProteinShortfallG = gramsInBudget?.let {
                    balancePer100g * it / Nutrition.GRAMS_PER_100G
                },
            )
        }
    }
}
