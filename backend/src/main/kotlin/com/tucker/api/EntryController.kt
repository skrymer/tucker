package com.tucker.api

import com.tucker.domain.DailyLog
import com.tucker.domain.Entry
import com.tucker.domain.EntryKind
import com.tucker.domain.EstimatedEntry
import com.tucker.domain.WeighedEntry
import com.tucker.persistence.EntryRepository
import com.tucker.persistence.FoodRepository
import com.tucker.service.WeeklyReviewService
import org.slf4j.LoggerFactory
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
    /**
     * The domain enum rather than a String, so the spec describes `kind` by the
     * values it can take and the generated client reads a union instead of an open
     * `string` (issue #213, and `maintenanceBasis` already does this).
     *
     * Safe here because this DTO is response-only and Jackson renders an enum as its
     * constant name — the text the String form spelled out with `.name` — so the wire
     * does not move. A DTO that also serves a request body cannot follow without
     * deciding what an unparseable value should return (ADR 0023 on `ProfileDto`).
     */
    val kind: EntryKind,
    val calories: Double,
    val protein: Double?,
    val isEstimate: Boolean,
    val foodId: Long?,
    val foodName: String?,
    val grams: Double?,
    val label: String?,
    /**
     * What the User recognises this Entry by (CONTEXT.md) — its Food's name when
     * weighed, its label when estimated. Stated here rather than reassembled by
     * the client from the nullable pair above, so the guarantee that an Entry
     * always has a name lives in the type (ADR 0002).
     */
    val name: String,
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

/**
 * A Budget Projection on the wire (CONTEXT.md): whether logging a prospective Entry
 * would push the day over the Calorie Budget, and by how much. [calorieBudget] and
 * [overByKcal] are null when no budget exists yet (before the first WeeklyReview).
 */
data class BudgetProjectionResponse(
    val wouldExceedBudget: Boolean,
    val projectedCaloriesConsumed: Double,
    val calorieBudget: Double?,
    val overByKcal: Double?,
)

private val logger = LoggerFactory.getLogger(EntryController::class.java)

/**
 * What a weighed Entry is called when its Food's name could not be resolved.
 * Named rather than blank so the rest of the day still reads. The Intake
 * Breakdown refuses the same state instead (`IntakeBreakdown.sliceName`), and the
 * split is deliberate: an invented label on a slice misstates a share, while a
 * day that will not render states nothing at all.
 */
private const val UNRESOLVED_FOOD_NAME = "Unknown food"

/**
 * [foodName] is the name of the Food a weighed Entry ate, and is ignored by the
 * estimated arm, which names itself. It has no default: the one caller that can
 * fail to resolve it is [toResponses], and a name omitted anywhere else would
 * reach [UNRESOLVED_FOOD_NAME] without anything having gone wrong.
 */
internal fun Entry.toResponse(foodName: String?): EntryResponse = when (this) {
    is WeighedEntry -> EntryResponse(
        id = persistedId(id),
        loggedOn = loggedOn, kind = EntryKind.WEIGHED, calories = calories, protein = protein,
        isEstimate = false, foodId = foodId, foodName = foodName, grams = grams, label = null,
        name = foodName ?: UNRESOLVED_FOOD_NAME,
    )
    is EstimatedEntry -> EntryResponse(
        id = persistedId(id),
        loggedOn = loggedOn, kind = EntryKind.ESTIMATED, calories = calories, protein = protein,
        isEstimate = true, foodId = null, foodName = null, grams = null, label = label,
        // Trimmed, as `IntakeBreakdown.sliceName` already names the same Entry on
        // /review: nothing trims a label on write, so an untrimmed name here would
        // have one Entry reading two ways on two surfaces.
        name = label.trim(),
    )
}

/** Map Entries to responses, resolving every weighed Entry's Food name in one query. */
internal fun List<Entry>.toResponses(foods: FoodRepository): List<EntryResponse> {
    val namesById = foods.namesOf(this)
    warnUnresolved(namesById)
    return map { entry ->
        when (entry) {
            is WeighedEntry -> entry.toResponse(foodName = namesById[entry.foodId])
            is EstimatedEntry -> entry.toResponse(foodName = null)
        }
    }
}

/**
 * The Foods these Entries name that [namesById] did not resolve, each once. An
 * Entry's Food always exists ([foodsOf]), so a non-empty answer means either an
 * invariant breach or a Food deleted between the two reads that produced the
 * arguments.
 */
internal fun List<Entry>.unresolvedFoodIds(namesById: Map<Long, String>): List<Long> =
    filterIsInstance<WeighedEntry>()
        .map { it.foodId }
        .distinct()
        .filterNot { namesById.containsKey(it) }

/**
 * One line for a whole read rather than one per Entry, so a day whose Entries all
 * name the same unresolved Food reports it once per load instead of once each.
 */
private fun List<Entry>.warnUnresolved(namesById: Map<Long, String>) {
    val unresolved = unresolvedFoodIds(namesById)
    if (unresolved.isNotEmpty()) {
        logger.warn("Foods {} named by Entries could not be resolved to a name", unresolved)
    }
}

@RestController
@RequestMapping("/api/entries")
class EntryController(
    private val entries: EntryRepository,
    private val foods: FoodRepository,
    private val weeklyReview: WeeklyReviewService,
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
            .toResponse(foodName = food.name)
    }

    /**
     * A non-persisting Budget Projection: would logging this weighed Entry push the
     * day over the Calorie Budget? Nothing is written — this only forecasts.
     */
    @PostMapping("/weighed/preview")
    fun previewWeighed(@RequestBody request: LogWeighedEntryRequest): BudgetProjectionResponse {
        val food = foods.findById(request.foodId)
            ?: throw NotFoundException("no Food with id ${request.foodId}")
        return projectionFor(request.date, WeighedEntry.log(request.date, food, request.grams))
    }

    /**
     * Forecast the day's over-budget state if [prospective] were logged on [date],
     * against the latest review's budget and floor. With no review yet there is no
     * budget to exceed, so the projection reports the running total only.
     */
    private fun projectionFor(date: LocalDate, prospective: Entry): BudgetProjectionResponse {
        val log = DailyLog(date, entries.findByDate(date))
        val targets = weeklyReview.recentReviews().firstOrNull()?.intakeTargets
        val projection = log.project(prospective, targets?.calorieBudgetKcal, targets?.proteinFloorG)
        return BudgetProjectionResponse(
            wouldExceedBudget = projection.wouldExceedBudget,
            projectedCaloriesConsumed = projection.projectedCaloriesConsumed,
            calorieBudget = targets?.calorieBudgetKcal,
            overByKcal = projection.overByKcal,
        )
    }

    @PostMapping("/estimated")
    @ResponseStatus(HttpStatus.CREATED)
    fun logEstimated(@RequestBody request: LogEstimatedEntryRequest): EntryResponse =
        entries.insert(
            EstimatedEntry(null, request.date, request.label, request.calories, request.protein),
        ).toResponse(foodName = null)

    /**
     * A non-persisting Budget Projection: would logging this estimated Entry push the
     * day over the Calorie Budget? Nothing is written — this only forecasts.
     */
    @PostMapping("/estimated/preview")
    fun previewEstimated(@RequestBody request: LogEstimatedEntryRequest): BudgetProjectionResponse =
        projectionFor(
            request.date,
            EstimatedEntry(null, request.date, request.label, request.calories, request.protein),
        )

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable id: Long) = entries.delete(id)
}
