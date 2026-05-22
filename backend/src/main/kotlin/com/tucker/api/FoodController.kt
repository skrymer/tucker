package com.tucker.api

import com.tucker.domain.Food
import com.tucker.domain.Nutrition
import com.tucker.persistence.FoodRepository
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

/** Request to create a plain, manually-entered Food. */
data class CreateFoodRequest(
    val name: String,
    val barcode: String?,
    val caloriesPer100g: Double,
    val proteinPer100g: Double,
    val carbsPer100g: Double?,
    val fatPer100g: Double?,
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
class FoodController(private val foods: FoodRepository) {

    @GetMapping
    fun list(): List<FoodResponse> = foods.findAll().map { it.toResponse() }

    @GetMapping("/{id}")
    fun byId(@PathVariable id: Long): FoodResponse =
        foods.findById(id)?.toResponse() ?: throw NotFoundException("no Food with id $id")

    @GetMapping("/barcode/{barcode}")
    fun byBarcode(@PathVariable barcode: String): FoodResponse =
        foods.findByBarcode(barcode)?.toResponse()
            ?: throw NotFoundException("no Food with barcode $barcode")

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody request: CreateFoodRequest): FoodResponse {
        val food = Food.plain(
            id = null,
            name = request.name,
            barcode = request.barcode,
            nutrition = Nutrition(
                caloriesPer100g = request.caloriesPer100g,
                proteinPer100g = request.proteinPer100g,
                carbsPer100g = request.carbsPer100g,
                fatPer100g = request.fatPer100g,
            ),
        )
        return foods.insert(food).toResponse()
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable id: Long) = foods.delete(id)
}
