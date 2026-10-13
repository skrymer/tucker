package com.tucker.api

import com.fasterxml.jackson.databind.ObjectMapper
import com.tucker.domain.Nutrition
import com.tucker.persistence.FoodRepository
import com.tucker.security.WithTuckerUser
import org.hamcrest.Matchers.closeTo
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional

/** `GET /api/foods/{id}/recipes` — the Recipes a correction of a Food would reach (ADR 0037). */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithTuckerUser
class FoodRecipesApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var foods: FoodRepository

    @Test
    fun `the Recipes using a Food come alphabetically, each with its cooked weight and ingredient lines`() {
        val mince = createFood("Mince", protein = 31.0, carbs = 0.0, fat = 10.0) // 214 kcal /100g
        val onion = createFood("Onion", protein = 1.0, carbs = 9.0, fat = 0.0) // 40 kcal /100g
        createRecipe("Stew", 200.0, mince to 300.0, onion to 100.0)
        createRecipe("Cottage pie", 400.0, mince to 400.0)
        createRecipe("Onion soup", 500.0, onion to 250.0)

        mockMvc.get("/api/foods/$mince/recipes").andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(2) }
            jsonPath("$[0].name") { value("Cottage pie") }
            jsonPath("$[0].cookedWeightG") { value(400.0) }
            jsonPath("$[0].ingredients.length()") { value(1) }
            jsonPath("$[0].ingredients[0].foodId") { value(mince) }
            jsonPath("$[0].ingredients[0].grams") { value(400.0) }
            jsonPath("$[1].name") { value("Stew") }
            jsonPath("$[1].cookedWeightG") { value(200.0) }
            jsonPath("$[1].ingredients.length()") { value(2) }
            jsonPath("$[1].ingredients[0].foodId") { value(mince) }
            jsonPath("$[1].ingredients[0].grams") { value(300.0) }
            jsonPath("$[1].ingredients[0].caloriesPer100g", closeTo(214.0, 0.001))
            jsonPath("$[1].ingredients[0].proteinPer100g", closeTo(31.0, 0.001))
            jsonPath("$[1].ingredients[1].foodId") { value(onion) }
            jsonPath("$[1].ingredients[1].grams") { value(100.0) }
            jsonPath("$[1].ingredients[1].caloriesPer100g", closeTo(40.0, 0.001))
            jsonPath("$[1].ingredients[1].proteinPer100g", closeTo(1.0, 0.001))
        }
    }

    @Test
    fun `each Recipe comes with the figures it is stored with, not a roll-up of its lines`() {
        val mince = createFood("Mince", protein = 31.0, carbs = 0.0, fat = 10.0) // 214 kcal /100g
        val pie = createRecipe("Cottage pie", 400.0, mince to 400.0) // rolls up to 214 kcal, 31 g
        val stored = foods.findById(pie)!!
        foods.update(stored.copy(nutrition = Nutrition(220.0, 32.0, null, null)))

        mockMvc.get("/api/foods/$mince/recipes").andExpect {
            jsonPath("$[0].caloriesPer100g", closeTo(220.0, 0.001))
            jsonPath("$[0].proteinPer100g", closeTo(32.0, 0.001))
        }
    }

    @Test
    fun `each Recipe using a Food carries its own id`() {
        val mince = createFood("Mince", protein = 31.0, carbs = 0.0, fat = 10.0)
        val pie = createRecipe("Cottage pie", 400.0, mince to 400.0)

        mockMvc.get("/api/foods/$mince/recipes").andExpect {
            jsonPath("$[0].id") { value(pie) }
        }
    }

    @Test
    fun `a Food no Recipe uses is used in none`() {
        val oats = createFood("Rolled oats", protein = 13.0, carbs = 60.0, fat = 7.0)

        mockMvc.get("/api/foods/$oats/recipes").andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(0) }
        }
    }

    @Test
    fun `the Recipes using a Food that does not exist are not found`() {
        mockMvc.get("/api/foods/999999/recipes").andExpect {
            status { isNotFound() }
            jsonPath("$.message") { value("no Food with id 999999") }
        }
    }

    private fun createRecipe(name: String, cookedWeightG: Double, vararg ingredients: Pair<Long, Double>): Long {
        val lines = ingredients.joinToString(",") { (id, grams) -> """{"foodId":$id,"grams":$grams}""" }
        val body = mockMvc.post("/api/recipes") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"$name","cookedWeightG":$cookedWeightG,"ingredients":[$lines],"tagIds":[]}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        return objectMapper.readTree(body).get("id").asLong()
    }

    private fun createFood(name: String, protein: Double, carbs: Double, fat: Double): Long {
        val body = mockMvc.post("/api/foods") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"$name","barcode":null,"proteinPer100g":$protein,
                          "carbsPer100g":$carbs,"fatPer100g":$fat,"tagIds":[]}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        return objectMapper.readTree(body).get("id").asLong()
    }
}
