package com.tucker.api

import com.tucker.domain.BarcodeLookup
import com.tucker.domain.Food
import com.tucker.domain.FoodCandidate
import com.tucker.domain.Nutrition
import com.tucker.persistence.FoodRepository
import com.tucker.service.BarcodeLookupService
import com.tucker.service.FoodService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

/** API representation of a Food (nutrition flattened for the wire). */
data class FoodResponse(
    val id: Long,
    val name: String,
    val kind: String,
    val barcode: String?,
    val caloriesPer100g: Double,
    val proteinPer100g: Double,
    val carbsPer100g: Double?,
    val fatPer100g: Double?,
    val cookedWeightG: Double?,
)

/**
 * Request to create a plain, manually-entered Food.
 *
 * The user supplies the three macros; the backend derives `caloriesPer100g`
 * via the Atwater factors (`4 × protein + 4 × carbs + 9 × fat`). See
 * `Nutrition.fromMacros` and CONTEXT.md.
 */
data class CreateFoodRequest(
    val name: String,
    val barcode: String?,
    val proteinPer100g: Double,
    val carbsPer100g: Double,
    val fatPer100g: Double,
)

/**
 * A [FoodCandidate] on the wire (ADR 0006): normalised per-100g macros with
 * absent ones left `null`, the Provider's stated energy as a cross-check, the
 * source for attribution, and the barcode. No calories — they are Atwater-derived
 * when the user confirms the Food via `POST /api/foods`.
 */
data class FoodCandidateResponse(
    val name: String,
    val barcode: String,
    val proteinPer100g: Double?,
    val carbsPer100g: Double?,
    val fatPer100g: Double?,
    val statedEnergyKcalPer100g: Double?,
    val source: String,
)

/**
 * The discriminated result of a barcode lookup. [outcome] is `EXISTING` (with
 * [food] set) or `CANDIDATE` (with [candidate] set); a miss is HTTP 404, not a
 * body. See ADR 0006.
 */
data class BarcodeLookupResponse(
    val outcome: String,
    val food: FoodResponse?,
    val candidate: FoodCandidateResponse?,
)

internal fun FoodCandidate.toResponse() = FoodCandidateResponse(
    name = name,
    barcode = barcode,
    proteinPer100g = proteinPer100g,
    carbsPer100g = carbsPer100g,
    fatPer100g = fatPer100g,
    statedEnergyKcalPer100g = statedEnergyKcalPer100g,
    source = source,
)

internal fun Food.toResponse() = FoodResponse(
    id = persistedId(id),
    name = name,
    kind = kind.name,
    barcode = barcode,
    caloriesPer100g = nutrition.caloriesPer100g,
    proteinPer100g = nutrition.proteinPer100g,
    carbsPer100g = nutrition.carbsPer100g,
    fatPer100g = nutrition.fatPer100g,
    cookedWeightG = cookedWeightG,
)

@RestController
@RequestMapping("/api/foods")
class FoodController(
    private val foods: FoodRepository,
    private val foodService: FoodService,
    private val barcodeLookup: BarcodeLookupService,
) {

    @GetMapping
    fun list(): List<FoodResponse> = foods.findAll().map { it.toResponse() }

    @GetMapping("/{id}")
    fun byId(@PathVariable id: Long): FoodResponse =
        foods.findById(id)?.toResponse() ?: throw NotFoundException("no Food with id $id")

    /**
     * Resolve a barcode catalog-first, then through the operator-configured
     * Provider chain (ADR 0006): `200 EXISTING` (a saved Food), `200 CANDIDATE`
     * (provider-sourced nutrition to review), or `404` on a total miss.
     */
    @GetMapping("/barcode/{barcode}")
    fun byBarcode(@PathVariable barcode: String): BarcodeLookupResponse =
        when (val result = barcodeLookup.lookup(barcode)) {
            is BarcodeLookup.Existing ->
                BarcodeLookupResponse("EXISTING", food = result.food.toResponse(), candidate = null)
            is BarcodeLookup.Candidate ->
                BarcodeLookupResponse("CANDIDATE", food = null, candidate = result.candidate.toResponse())
            null -> throw NotFoundException("no Food or Provider match for barcode $barcode")
        }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody request: CreateFoodRequest): FoodResponse {
        val food = Food.plain(
            id = null,
            name = request.name,
            barcode = request.barcode,
            nutrition = Nutrition.fromMacros(
                proteinPer100g = request.proteinPer100g,
                carbsPer100g = request.carbsPer100g,
                fatPer100g = request.fatPer100g,
            ),
        )
        return foods.insert(food).toResponse()
    }

    /**
     * Remove a Food from the catalog. A Food referenced by at least one Entry
     * cannot be deleted (CONTEXT.md, Food); [FoodService] enforces that rule and
     * surfaces a 400 naming the Food.
     */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable id: Long) = foodService.delete(id)
}
