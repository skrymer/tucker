package com.tucker.domain

/**
 * The daily Protein Floor: 2 g of protein per kg of body weight, computed from
 * the smoothed Trend Weight.
 *
 * Decoupled from the Goal (ADR 0008) — it applies in Maintenance Mode (no active
 * Goal) exactly as it does during a cut, so it is derived directly from the
 * trend rather than carried by a Goal.
 */
object ProteinFloor {
    /** Grams of protein per kg of body weight. */
    const val GRAMS_PER_KG = 2.0

    fun forTrendWeight(trendWeightKg: Double): Double = GRAMS_PER_KG * trendWeightKg
}
