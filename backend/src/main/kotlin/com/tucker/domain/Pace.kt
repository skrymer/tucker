package com.tucker.domain

/**
 * Pace (CONTEXT.md): the protein per 100 kcal a day must average to reach the
 * **Protein Floor** inside the **Calorie Budget** — `Floor ÷ Budget × 100`.
 *
 * It is derived from the user's own two targets rather than invented, so it moves
 * with them: a deeper Goal deficit tightens it (fewer calories, same floor) and
 * Maintenance Mode eases it. A Food above pace carries its own protein weight; one
 * below spends calories faster than it returns protein, so the rest of the day has
 * to make up the difference. It describes a Food's relationship to those targets —
 * never a verdict on the Food (ADR 0022).
 */
@JvmInline
value class Pace(val gPer100Kcal: Double) {

    /** The protein [kcal] calories must carry to keep pace with the Protein Floor. */
    fun proteinNeededFor(kcal: Double): Double = gPer100Kcal * kcal / KCAL_PER_100_KCAL

    companion object {
        /** The energy, in kcal, that a protein-per-100-kcal figure is expressed per. */
        const val KCAL_PER_100_KCAL = 100.0

        /** The pace implied by a [calorieBudgetKcal] / [proteinFloorG] pair. */
        fun from(calorieBudgetKcal: Double, proteinFloorG: Double): Pace =
            Pace(proteinFloorG / calorieBudgetKcal * KCAL_PER_100_KCAL)
    }
}
