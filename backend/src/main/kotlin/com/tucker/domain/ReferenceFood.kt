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

    /**
     * How much of [nutrient] [grams] supplies — the micronutrient counterpart of
     * [Nutrition.proteinFor], on the type that owns the per-100 g unit.
     */
    fun amountFor(nutrient: Micronutrient, grams: Double): Double =
        grams / Nutrition.GRAMS_PER_100G * this[nutrient]

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

/**
 * Thrown when a [BorrowedFood] is assembled from a Food and a Reference Food that
 * are not the two halves of one match.
 *
 * Its own type rather than a `require`: `ApiExceptionHandler` maps an
 * [IllegalArgumentException] to a 400 and an [IllegalStateException] to a 409, and
 * this is neither — the join is Tucker's own, built from rows Tucker has just read,
 * so getting it wrong is a server fault and must read as one.
 */
class MisjoinedBorrowException(message: String) : RuntimeException(message)

/**
 * A **Food** and what it borrows — the two halves of a match, joined (ADR 0027).
 *
 * One type rather than a Food map beside a Reference Food map, because the two are
 * only ever read together and separately they can disagree silently.
 */
data class BorrowedFood(val food: Food, val reference: ReferenceFood?) {
    init {
        if (food.referenceFoodId != null && reference == null) {
            throw MisjoinedBorrowException("'${food.name}' is matched but was joined to nothing")
        }
        if (reference != null && reference.id != food.referenceFoodId) {
            throw MisjoinedBorrowException(
                "'${food.name}' borrows ${food.referenceFoodId} but was joined to ${reference.id}",
            )
        }
    }

    /**
     * Whether this Food can supply a micronutrient figure at all — which is also
     * what makes it count toward coverage, so the numerator and the denominator of
     * one read describe the same set of food.
     *
     * A **Recipe** is excluded because it rolls its micronutrients up from whichever
     * ingredients are matched, which is issue #280; until then it contributes
     * nothing. `Food`'s own invariant already refuses to match one, so this states
     * the rule where it is read rather than guarding a reachable state.
     */
    val contributes: Boolean get() = reference != null && food.kind == FoodKind.FOOD
}
