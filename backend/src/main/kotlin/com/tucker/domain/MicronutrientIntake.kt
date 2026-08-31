package com.tucker.domain

import java.time.LocalDate

/**
 * A **Food** in a window that borrows no micronutrients yet, with what it cost —
 * one row of the match queue (ADR 0027).
 *
 * Ranked by [share] of the window's calories rather than alphabetically, which is
 * what makes the queue worth working through: diets are repetitive, so the first
 * few taps are most of a week.
 */
data class UnmatchedFood(
    val foodId: Long,
    val name: String,
    val calories: Double,
    val share: Double,
)

/**
 * What a window of food could tell a User about their vitamins and minerals
 * (CONTEXT.md, ADR 0027) — in this slice, only *how much of it could tell them
 * anything at all* and what is left to match. The figures themselves are issue #279.
 *
 * [coverage] is the share of the window's calories that came from a Food with a
 * **Reference Food** behind it. It is stated always and **never scaled up**: what
 * goes unmatched is disproportionately restaurant and packaged food, so filling the
 * gap by extrapolation would read as a neutral estimate and be a biased one.
 */
data class MicronutrientIntake(
    val from: LocalDate,
    val to: LocalDate,
    /**
     * What the window ate. Carried because [coverage] alone cannot tell a week where
     * everything is matched from one where nothing was logged — both are an empty
     * queue, and only one of them is finished.
     */
    val totalCalories: Double,
    val coverage: Double,
    val unmatched: List<UnmatchedFood>,
) {
    companion object {
        /**
         * Read [breakdown] as a Micronutrient Intake. [foods] must hold every Food the
         * breakdown's slices name; a slice naming none is an **Estimated Entry**, which
         * has no Food and so can never contribute or be queued.
         *
         * The queue is the breakdown filtered to the unmatched, so both share one
         * ranking and one denominator rather than inventing a second pair.
         */
        fun of(breakdown: IntakeBreakdown, foods: Map<Long, Food>): MicronutrientIntake {
            // A Recipe is a Food row, so it arrives here like any other and has to be
            // put aside: it is never matched, and rolling it up through whichever of
            // its ingredients are is issue #280. Until then it neither covers anything
            // nor joins the queue, where it would be a tap that cannot be taken.
            //
            // Partitioned rather than filtered twice: covered and queued are the two
            // halves of one split, and a third state added later has to be given a
            // home here rather than falling through both predicates unnoticed.
            val (covered, queued) = breakdown.items
                .mapNotNull { item -> foods[item.foodId]?.let { item to it } }
                .filter { (_, food) -> food.kind == FoodKind.FOOD }
                .partition { (_, food) -> food.referenceFoodId != null }
            return MicronutrientIntake(
                from = breakdown.from,
                to = breakdown.to,
                totalCalories = breakdown.totalCalories,
                // A window that ate nothing has nothing to cover; the alternative is a
                // NaN on the wire.
                coverage = breakdown.totalCalories
                    .takeIf { it > 0 }
                    ?.let { total -> covered.sumOf { (item, _) -> item.calories } / total }
                    ?: 0.0,
                // The id is non-null by construction: a slice with none names no Food,
                // so `foods[item.foodId]` above dropped it.
                unmatched = queued.map { (item, _) ->
                    UnmatchedFood(item.foodId!!, item.name, item.calories, item.share)
                },
            )
        }
    }
}
