package com.tucker.domain

/**
 * How much of each [Micronutrient] a food supplies per 100 g.
 *
 * Every nutrient is present or the type refuses to exist: AFCD populates all
 * nineteen on all 1,588 of its foods, so a missing one is a parse that went wrong
 * rather than a food that lacks the nutrient (a food that lacks it reports zero).
 */
data class Micronutrients(val amounts: Map<Micronutrient, Double>) {
    init {
        require(amounts.keys == ALL) {
            "a Reference Food carries every micronutrient, missing " +
                (Micronutrient.entries - amounts.keys).joinToString()
        }
        require(amounts.values.all { it >= 0 }) { "a micronutrient amount must not be negative" }
    }

    /** How much of [nutrient] 100 g supplies, in its own [Micronutrient.unit]. */
    operator fun get(nutrient: Micronutrient): Double = amounts.getValue(nutrient)

    private companion object {
        /** Hoisted: every Micronutrients built would otherwise allocate this set. */
        val ALL = Micronutrient.entries.toSet()
    }
}

/**
 * A generic food in the Australian Food Composition Database — the micronutrient
 * detail a package label never carries (CONTEXT.md, ADR 0027).
 *
 * Global and owned by nobody: a **Food** *borrows* this profile through a match
 * rather than copying it, so a later AFCD release reaches every Food already
 * matched. [publicFoodKey] is AFCD's own identifier and is what makes that
 * re-seeding possible.
 */
data class ReferenceFood(
    val id: Long,
    val publicFoodKey: String,
    val name: String,
    val micronutrients: Micronutrients,
)
