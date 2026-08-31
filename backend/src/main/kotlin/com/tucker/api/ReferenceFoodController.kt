package com.tucker.api

import com.tucker.domain.Micronutrient
import com.tucker.domain.ReferenceFoodCandidate
import com.tucker.domain.ReferenceFoodQuery
import com.tucker.domain.ReferenceFoodSearch
import com.tucker.persistence.ReferenceFoodRepository
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

/** One Reference Food a search reached, with the figures that set the results apart. */
data class ReferenceFoodCandidateResponse(
    val id: Long,
    val name: String,
    val distinguishing: List<MicronutrientAmountResponse>,
)

/**
 * How much of one nutrient a Reference Food supplies per 100 g. [label] and [unit]
 * ride along because a bare number is unreadable and an enum name is not a label —
 * and Tucker names the nutrients, so nothing downstream has to.
 */
data class MicronutrientAmountResponse(
    val nutrient: String,
    val label: String,
    val unit: String,
    val amount: Double,
)

/**
 * What a search of the Reference Foods came back with.
 *
 * [suggestedId] is the one candidate Tucker offers to accept, and is **null when it
 * will not guess** — a confidently wrong top hit is this feature's characteristic
 * failure, so withholding is the answer rather than a fallback (ADR 0027). The
 * candidates are still ranked and still listed; only the tap is withheld.
 */
data class ReferenceFoodSearchResponse(
    val suggestedId: Long?,
    val candidates: List<ReferenceFoodCandidateResponse>,
)

@RestController
@RequestMapping("/api/reference-foods")
class ReferenceFoodController(private val referenceFoods: ReferenceFoodRepository) {

    /**
     * The Reference Foods [q] reaches, best first. Unscoped, alone among the reads a
     * request makes: a Reference Food describes a generic food rather than one
     * person's, so the table is global and unowned (ADR 0021).
     */
    @GetMapping
    fun search(@RequestParam q: String): ReferenceFoodSearchResponse {
        val query = ReferenceFoodQuery.of(q, referenceFoods.synonyms())
        val search = ReferenceFoodSearch.of(referenceFoods.search(query, CANDIDATE_LIMIT))
        return ReferenceFoodSearchResponse(
            suggestedId = search.suggested?.food?.id,
            candidates = search.candidates.map { it.toResponse(search.distinguishing) },
        )
    }

    private fun ReferenceFoodCandidate.toResponse(distinguishing: List<Micronutrient>) =
        ReferenceFoodCandidateResponse(
            id = food.id,
            name = food.name,
            // The same nutrients in the same order on every row, because they were
            // chosen for the *set*: a list whose rows report different ones cannot be
            // read down a column, and "how do these differ?" is a question about the set.
            distinguishing = distinguishing.map {
                MicronutrientAmountResponse(
                    nutrient = it.name,
                    label = it.label,
                    unit = it.unit,
                    amount = food.micronutrients[it],
                )
            },
        )

    private companion object {
        /** As many as the picker lists before a User would rather retype than scroll. */
        const val CANDIDATE_LIMIT = 20
    }
}
