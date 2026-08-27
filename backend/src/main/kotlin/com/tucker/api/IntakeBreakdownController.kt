package com.tucker.api

import com.tucker.domain.IntakeBreakdown
import com.tucker.domain.IntakeBreakdownItem
import com.tucker.persistence.EntryRepository
import com.tucker.persistence.FoodRepository
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate

/**
 * One slice on the wire. [foodId] is null for an Estimated Entry, which has no
 * Food, and [protein] is null when nothing in the slice carried a figure.
 */
data class IntakeBreakdownItemResponse(
    val foodId: Long?,
    val name: String,
    val calories: Double,
    val protein: Double?,
    /** The slice's calories over [IntakeBreakdownResponse.totalCalories], 0–1. */
    val share: Double,
    val isEstimate: Boolean,
)

/**
 * An Intake Breakdown on the wire (ADR 0026): every slice, ranked, with no cap and
 * no "Other" — folding the tail is a fact about how many hues a chart has, so the
 * client does it. Shares are of [totalCalories]; the Calorie Budget appears nowhere.
 */
data class IntakeBreakdownResponse(
    val from: LocalDate,
    val to: LocalDate,
    val totalCalories: Double,
    /** Days in the window carrying at least one Entry, so a client can say how far to trust it. */
    val loggedDays: Int,
    val items: List<IntakeBreakdownItemResponse>,
)

private fun IntakeBreakdownItem.toResponse() = IntakeBreakdownItemResponse(
    foodId = foodId,
    name = name,
    calories = calories,
    protein = protein,
    share = share,
    isEstimate = isEstimate,
)

private fun IntakeBreakdown.toResponse() = IntakeBreakdownResponse(
    from = from,
    to = to,
    totalCalories = totalCalories,
    loggedDays = loggedDays,
    items = items.map { it.toResponse() },
)

@RestController
@RequestMapping("/api/intake-breakdown")
class IntakeBreakdownController(
    private val entries: EntryRepository,
    private val foods: FoodRepository,
) {

    /**
     * The breakdown of the window [from]..[to], both bounds inclusive. The client
     * owns the window (ADR 0014) — it is the only thing that knows the User's local
     * day. An empty window is an empty breakdown, not a 404.
     *
     * Read-only transactional because it reads two tables and the second must
     * describe the first: without it the Entries and the Food names are two
     * separate instants, and a Food deleted in the gap leaves an Entry whose name
     * cannot be resolved. Deleting a referenced Food is refused, so that gap is the
     * only way the two can disagree — and it closes by holding one connection
     * across both reads rather than by tolerating a missing name, which would put
     * an invented label on a real slice.
     */
    @Transactional(readOnly = true)
    @GetMapping
    fun breakdown(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) from: LocalDate,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) to: LocalDate,
    ): IntakeBreakdownResponse {
        val logged = entries.findBetween(from, to)
        // A Recipe is a Food row, so it names itself here like any other and is never
        // exploded into its ingredients (ADR 0026).
        val names = foods.namesOf(logged)
        return IntakeBreakdown.of(from, to, logged, names).toResponse()
    }
}
