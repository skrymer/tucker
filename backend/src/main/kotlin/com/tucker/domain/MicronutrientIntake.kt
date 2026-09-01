package com.tucker.domain

import java.time.LocalDate
import java.time.temporal.ChronoUnit

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
    val share: Double,
)

/** What Tucker can honestly say about one nutrient over a window (ADR 0027). */
enum class MicronutrientClaim {
    /**
     * The bound is already past the line not to cross. Sound at **any** coverage:
     * more data can only push the figure further over.
     */
    OVER_LIMIT,

    /** The bound already reaches the published figure, so the window reached it too. */
    CLEARS_REFERENCE,

    /**
     * Neither can be said. **Not** a shortfall and never a deficiency: the share
     * that went unmatched could easily hold the rest.
     */
    NOT_ENOUGH_MATCHED,
}

/**
 * What a window supplied of one nutrient, and what Tucker can say about it.
 *
 * [amount] is a **lower bound**, expressed as a day's average over the window in
 * the nutrient's own [Micronutrient.unit] — a Reference Intake is a daily figure,
 * and a week's total read against a daily line clears almost everything at once.
 */
data class MicronutrientRow(
    val nutrient: Micronutrient,
    val amount: Double,
    /**
     * The published figures [claim] was decided against, or null where the body has
     * no band open. Carried whole rather than split into its halves, so a reader
     * cannot pair a figure with a line that was never read against it (ADR 0024's
     * argument for [IntakeTargets] over four nullable fields).
     */
    val reference: ReferenceIntake?,
    val claim: MicronutrientClaim,
)

/**
 * What a window of food told a User about their vitamins and minerals
 * (CONTEXT.md, ADR 0027): a lower-bound daily average per nutrient read against
 * its **Reference Intake**, how much of the window could contribute one at all,
 * and what is left to match.
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
    /**
     * Days in the window carrying at least one **Entry**. The width of a window is
     * no evidence it was lived in, so a seven-day claim built from three logged days
     * is discounted rather than read at face value (ADR 0026).
     */
    val loggedDays: Int,
    val coverage: Double,
    /**
     * Whether any **Reference Intake** resolved for this body, and so whether any
     * nutrient can earn a claim at all. False with no **Profile**, and equally false
     * for a body below the youngest band published — both are a question Tucker has
     * no line to answer, however much of the window was matched.
     *
     * Carried because that and a poorly matched week earn opposite advice — *tell
     * Tucker whose body this is* against *match more food* — and are otherwise
     * identical on the wire. The same trap `setupComplete` was promoted onto the
     * daily summary to fix, where `calorieBudget == null` also meant two things
     * (ADR 0024).
     */
    val hasReferenceIntakes: Boolean,
    val rows: List<MicronutrientRow>,
    val unmatched: List<UnmatchedFood>,
) {
    companion object {
        /**
         * How wide a window a Micronutrient Intake is read over, and the only width
         * it is read over: micronutrient intake is enormously spiky day to day — one
         * serve of liver is a week of vitamin A — so anything shorter is noise
         * wearing a number's clothes (CONTEXT.md).
         */
        const val WINDOW_DAYS = 7

        /**
         * Read the window [from]..[to], both bounds inclusive, as a Micronutrient
         * Intake. [eaten] must hold every Food the [entries] reference, each joined to
         * what it borrows — an Entry naming none is an **Estimated Entry**, which has
         * no Food and so can never contribute or be queued. [references] is the set of
         * lines to read the result against, and is null when there is no body to
         * resolve them for — which is a different thing from a body with no band open.
         */
        fun of(
            from: LocalDate,
            to: LocalDate,
            entries: List<Entry>,
            eaten: Map<Long, BorrowedFood>,
            references: Map<Micronutrient, ReferenceIntake>?,
        ): MicronutrientIntake {
            // Refused rather than served, the move IntakeBreakdown.of already makes
            // for an Entry outside its window: the width is an invariant of this read
            // and not a User's choice, so leaving it to the one client call site that
            // happens to ask for seven days is an invariant nothing checks.
            require(ChronoUnit.DAYS.between(from, to) == WINDOW_DAYS - 1L) {
                "a Micronutrient Intake is read over the trailing $WINDOW_DAYS days, was $from..$to"
            }
            // The queue is the breakdown filtered to the unmatched, so both share one
            // ranking and one denominator rather than inventing a second pair.
            val breakdown = IntakeBreakdown.of(from, to, entries, eaten.mapValues { it.value.food.name })
            // Partitioned rather than filtered twice: what covers and what is left to
            // do are the two halves of one split, so a state added later has to be
            // given a home here rather than falling through both predicates unnoticed.
            // `contributes` is the same property `rowsOf` reads, which is what keeps
            // this read's numerator and denominator describing one set of food.
            val (covered, rest) = breakdown.items
                .mapNotNull { item -> eaten[item.foodId]?.let { item to it } }
                .partition { (_, borrowed) -> borrowed.contributes }
            // A Recipe is in neither half. It covers nothing until its ingredients roll
            // up (issue #280), and queueing it would be offering a tap that cannot be
            // taken — a Recipe is never matched.
            val queued = rest.filter { (_, borrowed) -> borrowed.food.kind == FoodKind.FOOD }
            return MicronutrientIntake(
                from = from,
                to = to,
                totalCalories = breakdown.totalCalories,
                loggedDays = breakdown.loggedDays,
                // A window that ate nothing has nothing to cover; the alternative is a
                // NaN on the wire.
                coverage = breakdown.totalCalories
                    .takeIf { it > 0 }
                    ?.let { total -> covered.sumOf { (item, _) -> item.calories } / total }
                    ?: 0.0,
                // Not `references != null`: a body below the youngest band published
                // resolves nothing, and telling that User to match more food is advice
                // no amount of matching can satisfy.
                hasReferenceIntakes = !references.isNullOrEmpty(),
                rows = rowsOf(entries, eaten, references.orEmpty()),
                // The id is non-null by construction: a slice with none names no Food,
                // so `eaten[item.foodId]` above dropped it.
                unmatched = queued.map { (item, _) ->
                    UnmatchedFood(item.foodId!!, item.name, item.share)
                },
            )
        }

        /**
         * A row per nutrient: the window's lower bound, and what it can be read as.
         *
         * Only a **Weighed Entry** whose Food carries a match can contribute, and it
         * contributes by the **grams eaten** — never by its calories or protein, which
         * would compound the inevitable disagreement between a package label and a
         * generic food (ADR 0027).
         */
        private fun rowsOf(
            entries: List<Entry>,
            eaten: Map<Long, BorrowedFood>,
            references: Map<Micronutrient, ReferenceIntake>,
        ): List<MicronutrientRow> {
            val borrowed = entries
                .filterIsInstance<WeighedEntry>()
                .mapNotNull { entry ->
                    eaten[entry.foodId]
                        ?.takeIf { it.contributes }
                        ?.let { entry.grams to it.reference!!.micronutrients }
                }
            return Micronutrient.entries.map { nutrient ->
                // Divided by the window's whole width rather than by the days that were
                // logged: a day nothing was logged on still happened, and averaging it
                // away would quietly scale the missing share up (CONTEXT.md).
                val perDay = borrowed.sumOf { (grams, profile) ->
                    profile.amountFor(nutrient, grams)
                } / WINDOW_DAYS
                val reference = references[nutrient]
                MicronutrientRow(
                    nutrient = nutrient,
                    amount = perDay,
                    reference = reference,
                    claim = claimFor(perDay, reference),
                )
            }
        }

        /**
         * What a lower bound of [amount] lets Tucker say against [reference].
         *
         * Sound in one direction only: over the limit it holds at **any** coverage,
         * because more data can only push the figure further over, while reaching the
         * recommended figure holds only once the bound already has. A bound that falls
         * short says nothing — the unmatched share could hold the rest (ADR 0027).
         */
        private fun claimFor(amount: Double, reference: ReferenceIntake?): MicronutrientClaim = when {
            reference?.limit?.let { amount > it.amount } == true -> MicronutrientClaim.OVER_LIMIT
            reference?.recommended?.let { amount >= it } == true -> MicronutrientClaim.CLEARS_REFERENCE
            // Including the nutrient with no published band at all, below the youngest
            // age seeded: no figure to read against is one more thing Tucker cannot say.
            else -> MicronutrientClaim.NOT_ENOUGH_MATCHED
        }
    }
}
