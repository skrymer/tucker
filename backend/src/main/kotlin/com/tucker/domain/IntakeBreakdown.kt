package com.tucker.domain

import java.time.LocalDate

/**
 * One slice of an [IntakeBreakdown]: what a Food cost in calories over the window
 * and what it returned in protein, with its share of the window's intake.
 *
 * [foodId] is null for an Estimated Entry, which has no Food — it slices by its
 * label. [protein] is null only when nothing in the slice carried a figure at all;
 * a known zero is stated (ADR 0026).
 */
data class IntakeBreakdownItem(
    val foodId: Long?,
    val name: String,
    val calories: Double,
    val protein: Double?,
    val share: Double,
    val isEstimate: Boolean,
)

/** What decides whether two Entries belong to the same slice. */
private data class SliceKey(val foodId: Long?, val label: String?)

/**
 * An Intake Breakdown (CONTEXT.md, ADR 0026): each Food's share of the calories a
 * User actually logged over a window, biggest first.
 *
 * The denominator is [totalCalories] — what was eaten — never the Calorie Budget,
 * so the breakdown reads identically on a day under budget and a day over it. The
 * whole ranking ships; folding a tail into "Other" is a fact about how many hues a
 * chart has, and belongs to the client.
 */
data class IntakeBreakdown(
    val from: LocalDate,
    val to: LocalDate,
    val totalCalories: Double,
    /** Days in the window that carry at least one Entry — how much of it to trust. */
    val loggedDays: Int,
    val items: List<IntakeBreakdownItem>,
) {
    companion object {
        /**
         * Roll [entries] up into slices. The window is the caller's: [from] and [to]
         * are carried, not applied, so an Entry outside them would be counted.
         * [foodNames] must name every Food the weighed Entries reference.
         */
        fun of(
            from: LocalDate,
            to: LocalDate,
            entries: List<Entry>,
            foodNames: Map<Long, String>,
        ): IntakeBreakdown {
            val totalCalories = entries.sumOf { it.calories }
            val items = entries.groupBy { it.sliceKey() }
                .map { (key, logged) -> key.slice(logged, totalCalories, foodNames) }
                .sortedByDescending { it.calories }
            return IntakeBreakdown(
                from = from,
                to = to,
                totalCalories = totalCalories,
                loggedDays = entries.map { it.loggedOn }.distinct().size,
                items = items,
            )
        }

        /**
         * What merges an Entry with another into one slice: its Food, or — for an
         * Estimated Entry, which has none — its trimmed, case-folded label. Free text
         * that differs by more than case stays two slices (ADR 0026).
         */
        private fun Entry.sliceKey(): SliceKey = when (this) {
            is WeighedEntry -> SliceKey(foodId = foodId, label = null)
            is EstimatedEntry -> SliceKey(foodId = null, label = label.trim().lowercase())
        }

        private fun SliceKey.slice(
            logged: List<Entry>,
            totalCalories: Double,
            foodNames: Map<Long, String>,
        ): IntakeBreakdownItem {
            val calories = logged.sumOf { it.calories }
            val known = logged.mapNotNull { it.protein }
            return IntakeBreakdownItem(
                foodId = foodId,
                // The first label seen rather than the folded key, so the slice reads
                // in the User's own capitalisation.
                name = logged.first().sliceName(foodNames),
                calories = calories,
                protein = known.takeIf { it.isNotEmpty() }?.sum(),
                // A window that ate nothing shares out nothing; the alternative is a
                // NaN on the wire.
                share = if (totalCalories > 0) calories / totalCalories else 0.0,
                isEstimate = logged.first().isEstimate,
            )
        }

        /** The slice's name as the User would recognise it, not the key it merged on. */
        private fun Entry.sliceName(foodNames: Map<Long, String>): String = when (this) {
            is WeighedEntry -> foodNames.getValue(foodId)
            is EstimatedEntry -> label.trim()
        }
    }
}
