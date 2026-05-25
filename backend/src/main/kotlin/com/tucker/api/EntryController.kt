package com.tucker.api

import com.tucker.domain.Entry
import com.tucker.domain.EntryKind
import com.tucker.domain.EstimatedEntry
import com.tucker.domain.WeighedEntry
import com.tucker.persistence.EntryRepository
import com.tucker.persistence.FoodRepository
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate

/** API representation of an Entry — the sealed hierarchy flattened for the wire. */
data class EntryResponse(
    val id: Long,
    val loggedOn: LocalDate,
    val kind: String,
    val calories: Double,
    val protein: Double?,
    val isEstimate: Boolean,
    val foodId: Long?,
    val foodName: String?,
    val grams: Double?,
    val label: String?,
)

/** Request to log a weighed Entry — a Food eaten at a measured weight. */
data class LogWeighedEntryRequest(
    val date: LocalDate,
    val foodId: Long,
    val grams: Double,
)

/** Request to log an estimated Entry — a meal that could not be weighed. */
data class LogEstimatedEntryRequest(
    val date: LocalDate,
    val label: String,
    val calories: Double,
    val protein: Double?,
)

internal fun Entry.toResponse(foodName: String? = null): EntryResponse = when (this) {
    is WeighedEntry -> EntryResponse(
        id = persistedId(id),
        loggedOn = loggedOn, kind = EntryKind.WEIGHED.name, calories = calories, protein = protein,
        isEstimate = false, foodId = foodId, foodName = foodName, grams = grams, label = null,
    )
    is EstimatedEntry -> EntryResponse(
        id = persistedId(id),
        loggedOn = loggedOn, kind = EntryKind.ESTIMATED.name, calories = calories, protein = protein,
        isEstimate = true, foodId = null, foodName = null, grams = null, label = label,
    )
}

/** Map Entries to responses, resolving every weighed Entry's Food name in one query. */
internal fun List<Entry>.toResponses(foods: FoodRepository): List<EntryResponse> {
    val namesById = foods
        .findByIds(filterIsInstance<WeighedEntry>().map { it.foodId }.distinct())
        .associate { it.id to it.name }
    return map { entry ->
        when (entry) {
            is WeighedEntry -> entry.toResponse(namesById[entry.foodId])
            is EstimatedEntry -> entry.toResponse()
        }
    }
}

@RestController
@RequestMapping("/api/entries")
class EntryController(
    private val entries: EntryRepository,
    private val foods: FoodRepository,
) {

    @GetMapping
    fun byDate(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) date: LocalDate,
    ): List<EntryResponse> = entries.findByDate(date).toResponses(foods)

    @PostMapping("/weighed")
    @ResponseStatus(HttpStatus.CREATED)
    fun logWeighed(@RequestBody request: LogWeighedEntryRequest): EntryResponse {
        val food = foods.findById(request.foodId)
            ?: throw NotFoundException("no Food with id ${request.foodId}")
        return entries.insert(WeighedEntry.log(request.date, food, request.grams))
            .toResponse(food.name)
    }

    @PostMapping("/estimated")
    @ResponseStatus(HttpStatus.CREATED)
    fun logEstimated(@RequestBody request: LogEstimatedEntryRequest): EntryResponse =
        entries.insert(
            EstimatedEntry(null, request.date, request.label, request.calories, request.protein),
        ).toResponse()

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable id: Long) = entries.delete(id)
}
