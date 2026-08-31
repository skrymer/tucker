package com.tucker.domain

/**
 * One Reference Food a User's words reached.
 *
 * [namesTheWholeFood] is whether those words accounted for every word of the food's
 * *head* — the part of an AFCD name before its first comma, which is the food
 * itself. `cheddar cheese` names the whole of `Cheese`, and `almond` names only
 * half of `Almond beverage`, which is a different food that merely starts with the
 * word asked for.
 */
data class ReferenceFoodCandidate(val food: ReferenceFood, val namesTheWholeFood: Boolean)

/**
 * What a search of the Reference Foods came back with, best first (ADR 0027).
 *
 * [distinguishing] are the figures a User is shown beside each candidate. They are
 * chosen for the result set rather than per candidate, because a list where every
 * row reports different nutrients cannot be read down a column — the question is
 * "how do these differ?", and that is a question about the set.
 */
data class ReferenceFoodSearch(
    val candidates: List<ReferenceFoodCandidate>,
    val distinguishing: List<Micronutrient>,
) {
    /**
     * The candidate Tucker offers to accept, or null when it will not guess.
     *
     * Offered only when the best one [names the whole food][ReferenceFoodCandidate.namesTheWholeFood]:
     * a head carrying a word the User never asked for is a different food, and this
     * feature's characteristic failure is a confidently wrong top hit rather than a
     * miss. Withholding costs a tap on a listed candidate; guessing costs a week of
     * figures for food that was never eaten, invisibly (ADR 0027).
     */
    val suggested: ReferenceFoodCandidate?
        get() = candidates.firstOrNull()?.takeIf { it.namesTheWholeFood }

    companion object {
        /** How many figures a candidate carries. Three fits a subline on a phone. */
        const val DISTINGUISHING_COUNT = 3

        fun of(ranked: List<ReferenceFoodCandidate>): ReferenceFoodSearch =
            ReferenceFoodSearch(ranked, distinguishing(ranked.map { it.food }))

        /**
         * The nutrients this set of foods most disagrees about, most first.
         *
         * Measured as *how many of the candidates the column separates* — the count
         * of distinct figures in it. A nutrient AFCD reports as zero for all but one
         * candidate splits off that one and leaves the rest indistinguishable, which
         * is a column a User cannot choose by, and zeros are everywhere in AFCD:
         * fibre in every cut of meat, iodine and selenium in most plants.
         *
         * Columns that separate the set equally are ordered by [spread], the range
         * over the largest value. That is a ratio and not an amount, because 40 mg
         * of potassium and 40 µg of iodine are the same number and nothing else, so
         * ranking by amount would put potassium and sodium above every vitamin on
         * every search.
         */
        private fun distinguishing(foods: List<ReferenceFood>): List<Micronutrient> =
            Micronutrient.entries
                .map { nutrient -> nutrient to foods.map { it.micronutrients[nutrient] } }
                .sortedWith(
                    compareByDescending<Pair<Micronutrient, List<Double>>> { (_, amounts) ->
                        amounts.distinct().size
                    }.thenByDescending { (_, amounts) -> spread(amounts) },
                )
                .take(DISTINGUISHING_COUNT)
                .map { (nutrient, _) -> nutrient }

        private fun spread(amounts: List<Double>): Double {
            // An empty set has no largest value, so `most` is 0 and the branch below
            // short-circuits before `min()` is asked for one it does not have.
            val most = amounts.maxOrNull() ?: 0.0
            return if (most > 0) (most - amounts.min()) / most else 0.0
        }
    }
}
