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
 * Thrown when a [BorrowedFood] is assembled from parts that do not belong together
 * — a Food and a Reference Food that are not the two halves of one match, or a
 * **Recipe** and a composition that is not the one it rolls up from.
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
data class BorrowedFood(
    val food: Food,
    val reference: ReferenceFood?,
    val ingredients: List<BorrowedIngredient> = emptyList(),
) {
    init {
        if (food.referenceFoodId != null && reference == null) {
            throw MisjoinedBorrowException("'${food.name}' is matched but was joined to nothing")
        }
        if (reference != null && reference.id != food.referenceFoodId) {
            throw MisjoinedBorrowException(
                "'${food.name}' borrows ${food.referenceFoodId} but was joined to ${reference.id}",
            )
        }
        if (food.kind == FoodKind.RECIPE && ingredients.isEmpty()) {
            throw MisjoinedBorrowException("'${food.name}' is a Recipe but was joined to no composition")
        }
        if (food.kind != FoodKind.RECIPE && ingredients.isNotEmpty()) {
            throw MisjoinedBorrowException("'${food.name}' is not a Recipe but was joined to a composition")
        }
    }

    /**
     * Whether this Food can supply a micronutrient figure at all — which is also
     * what makes it count toward coverage, so the numerator and the denominator of
     * one read describe the same set of food.
     *
     * A **Recipe** never satisfies it, and needs no clause of its own to be excluded:
     * `Food`'s invariant refuses to match one, so a reference implies a plain Food.
     */
    val contributes: Boolean get() = reference != null

    /**
     * How [grams] of this Food, costing [calories], divides among the Foods that
     * supplied it: itself, or — for a **Recipe** — the ingredients that made it,
     * each weighed as added and scaled by the share of the batch this portion is
     * (ADR 0019, ADR 0027).
     *
     * This is where a Recipe is excluded from supplying a figure of its own: it
     * never appears among its own contributions, so [contributes] is never asked
     * about one.
     *
     * An ingredient takes a **share** of the calories the Entry snapshotted rather
     * than what its grams would cost today. The shares sum to one, so an Entry is
     * redistributed exactly; re-deriving them would let a Recipe recalibrated since
     * it was logged put the coverage share over 100%.
     */
    fun divide(grams: Double, calories: Double): List<FoodContribution> {
        if (food.kind != FoodKind.RECIPE) return listOf(FoodContribution(this, grams, calories))
        // Non-null by `Food`'s invariant: a RECIPE is sliced out of its cooked weight.
        val cookedWeightG = food.cookedWeightG!!
        val batchCalories = ingredients.sumOf { it.borrowed.food.caloriesFor(it.grams) }
        return ingredients.map { line ->
            FoodContribution(
                borrowed = line.borrowed,
                grams = line.grams * grams / cookedWeightG,
                // The share first, then applied — not `calories * cost / batch`, which
                // rounds a sole ingredient's whole share of its own batch off 1.0.
                //
                // A batch of nothing but water and leaves costs nothing, and 0/0 is no
                // share of anything — but the Entry's calories still have to be shared
                // out in full, or they sit in the coverage denominator with nothing in
                // the numerator and read as a rest no tap can reach. Grams are what is
                // left to divide by, and they always sum to more than nothing.
                calories = calories * when {
                    batchCalories > 0 -> line.borrowed.food.caloriesFor(line.grams) / batchCalories
                    else -> line.grams / ingredients.sumOf { it.grams }
                },
            )
        }
    }
}

/** One ingredient of a **Recipe**, weighed as added, joined to what it borrows. */
data class BorrowedIngredient(val borrowed: BorrowedFood, val grams: Double)

/**
 * What one Food contributed to a window — the grams of it that were eaten and what
 * they cost (ADR 0027).
 *
 * A **Recipe** is never one: it divides into the ingredients that made it, so the
 * nutrient figures and the coverage share read one set of food rather than a second
 * one bolted on.
 */
data class FoodContribution(
    val borrowed: BorrowedFood,
    val grams: Double,
    val calories: Double,
)
