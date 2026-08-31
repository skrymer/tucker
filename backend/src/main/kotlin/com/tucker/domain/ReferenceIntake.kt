package com.tucker.domain

import java.time.LocalDate

/**
 * Which published figure an [IntakeLimit] is, because the NHMRC does not publish
 * only one kind and the two do not mean the same thing (ADR 0027).
 */
enum class IntakeLimitKind {
    /** An **Upper Level** of Intake: above this the risk of an adverse effect rises. */
    UPPER_LEVEL,

    /**
     * A **Suggested Dietary Target**: a figure set to lower chronic-disease risk
     * across a population rather than to mark where harm begins.
     *
     * Sodium alone carries one, and only because the 2017 revision **withdrew** its
     * Upper Level — an adult's now reads "not determined" — leaving the SDT as the
     * only published line. Kept apart from an Upper Level rather than folded into
     * one column, so nothing tells a User a population target is a safety threshold.
     */
    SUGGESTED_DIETARY_TARGET,
}

/** The line a window's intake of a nutrient is not to cross. */
data class IntakeLimit(val amount: Double, val kind: IntakeLimitKind)

/**
 * What a body of a given age and sex is published as needing of one nutrient: a
 * figure to reach, a line not to cross, or — for sodium — only the second.
 *
 * Which nutrient it describes is the key of the map it is read out of, and is not
 * repeated here: a second copy would be a fact nothing keeps in agreement, and a
 * nutrient filed under the wrong one reads as poor coverage rather than as a bug.
 */
data class ReferenceIntake(val recommended: Double?, val limit: IntakeLimit?)

/** One published band: what [nutrient] is set at for [sex] from [fromAge] years on. */
data class ReferenceIntakeBand(
    val nutrient: Micronutrient,
    val sex: Sex,
    val fromAge: Int,
    val intake: ReferenceIntake,
)

/** The published Nutrient Reference Values, as the bands they are set in. */
class NutrientReferenceValues(private val bands: List<ReferenceIntakeBand>) {

    /**
     * What [profile]'s body is published as needing, read at [on] — which callers
     * take as the window's **end** date, so a window spanning a birthday has one
     * answer rather than a different line per day (CONTEXT.md).
     *
     * A nutrient with no band open yet is absent rather than defaulted: below the
     * youngest age seeded there is no published figure, and reading a body against
     * an adult line that is not its own would be a confident wrong answer.
     */
    fun forBody(profile: Profile, on: LocalDate): Map<Micronutrient, ReferenceIntake> {
        val age = profile.ageOn(on)
        return bands
            .filter { it.sex == profile.sex && it.fromAge <= age }
            .groupBy { it.nutrient }
            .mapValues { (_, open) -> open.maxBy { it.fromAge }.intake }
    }
}
