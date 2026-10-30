package com.tucker.api

import com.fasterxml.jackson.databind.ObjectMapper
import com.tucker.domain.Macros
import com.tucker.domain.ReferenceFoodQuery
import com.tucker.persistence.ReferenceFoodRepository
import com.tucker.security.WithTuckerUser
import org.hamcrest.Matchers.closeTo
import org.hamcrest.Matchers.contains
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.transaction.annotation.Transactional

/** `PUT /api/foods/{id}` — correcting a Food: its name, macros and Tags (ADR 0037). */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithTuckerUser
class FoodCorrectionApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var referenceFoods: ReferenceFoodRepository

    @Test
    fun `a corrected Food answers with its new name and macros, calories derived from them`() {
        val oats = createFood("Rolled oast", protein = 31.0, carbs = 60.0, fat = 7.0)
        val breakfast = createTag("breakfast")

        // 4 × 13 + 4 × 60 + 9 × 7 = 355 kcal /100g
        mockMvc.put("/api/foods/$oats") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Rolled oats","proteinPer100g":13.0,"carbsPer100g":60.0,"fatPer100g":7.0,
                          "tagIds":[$breakfast]}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value(oats) }
            jsonPath("$.name") { value("Rolled oats") }
            jsonPath("$.kind") { value("FOOD") }
            jsonPath("$.caloriesPer100g", closeTo(355.0, 0.001))
            jsonPath("$.proteinPer100g", closeTo(13.0, 0.001))
            jsonPath("$.carbsPer100g", closeTo(60.0, 0.001))
            jsonPath("$.fatPer100g", closeTo(7.0, 0.001))
            jsonPath("$.tags.length()") { value(1) }
            jsonPath("$.tags[0].id") { value(breakfast) }
        }
    }

    @Test
    fun `every Recipe using a corrected Food is recalculated with it`() {
        // Mince as typed: 4 × 31 + 9 × 10 = 214 kcal /100g; corrected: 4 × 13 + 9 × 10 = 142.
        val mince = createFood("Mince", protein = 31.0, carbs = 0.0, fat = 10.0)
        val onion = createFood("Onion", protein = 1.0, carbs = 9.0, fat = 0.0) // 40 kcal /100g
        // 300 g mince + 100 g onion over a 200 g dish.
        val stew = createRecipe("Stew", 200.0, mince to 300.0, onion to 100.0)
        val pie = createRecipe("Cottage pie", 400.0, mince to 400.0)

        correct(mince, "Mince", Macros(proteinPer100g = 13.0, carbsPer100g = 0.0, fatPer100g = 10.0))

        // Stew: (426 + 40) / 200 × 100 = 233 kcal; (39 + 1) / 200 × 100 = 20 g protein.
        mockMvc.get("/api/foods/$stew").andExpect {
            jsonPath("$.caloriesPer100g", closeTo(233.0, 0.001))
            jsonPath("$.proteinPer100g", closeTo(20.0, 0.001))
        }
        // Cottage pie: 568 / 400 × 100 = 142 kcal; 52 / 400 × 100 = 13 g protein.
        mockMvc.get("/api/foods").andExpect {
            jsonPath("$[?(@.id == $pie)].caloriesPer100g") { value(contains(closeTo(142.0, 0.001))) }
            jsonPath("$[?(@.id == $pie)].proteinPer100g") { value(contains(closeTo(13.0, 0.001))) }
        }
        mockMvc.get("/api/recipes/$stew").andExpect {
            jsonPath("$.cookedWeightG") { value(200.0) }
            jsonPath("$.ingredients.length()") { value(2) }
            jsonPath("$.ingredients[0].name") { value("Mince") }
            jsonPath("$.ingredients[0].grams") { value(300.0) }
        }
    }

    @Test
    fun `correcting a Food's fibre re-derives its calories and recalculates every Recipe using it`() {
        // The wrap typed without its fibre: 4 × 19.4 + 4 × 12.8 + 9 × 9.3 = 212.5 kcal /100g.
        val wrap = createFood("Protein wrap", protein = 19.4, carbs = 12.8, fat = 9.3)
        // 200 g of wrap in a 400 g dish: 106.25 kcal /100g before the correction.
        val burrito = createRecipe("Burrito", 400.0, wrap to 200.0)

        correct(wrap, "Protein wrap", Macros(19.4, 12.8, 9.3, fibrePer100g = 16.8))

        // + 2 × 16.8 = 246.1 kcal /100g (ADR 0040).
        mockMvc.get("/api/foods/$wrap").andExpect {
            jsonPath("$.caloriesPer100g", closeTo(246.1, 0.001))
            jsonPath("$.fibrePer100g") { value(16.8) }
        }
        // Burrito: 492.2 / 400 × 100 = 123.05 kcal /100g, and 33.6 / 400 × 100 = 8.4 g fibre /100g.
        mockMvc.get("/api/foods/$burrito").andExpect {
            jsonPath("$.caloriesPer100g", closeTo(123.05, 0.001))
            jsonPath("$.fibrePer100g", closeTo(8.4, 0.001))
        }
    }

    @Test
    fun `correcting a Food's alcohol re-derives its calories and recalculates every Recipe using it`() {
        // The wine typed without its alcohol: 4 × 0.1 + 4 × 2.6 = 10.8 kcal /100g.
        val wine = createFood("Shiraz", protein = 0.1, carbs = 2.6, fat = 0.0)
        // 300 g of wine in a 600 g sauce: 5.4 kcal /100g before the correction.
        val sauce = createRecipe("Red wine sauce", 600.0, wine to 300.0)

        correct(wine, "Shiraz", Macros(0.1, 2.6, 0.0), alcoholAbv = 13.0)

        // + 7 × 13 × 0.789 = 82.599 kcal /100g (ADR 0040).
        mockMvc.get("/api/foods/$wine").andExpect {
            jsonPath("$.caloriesPer100g", closeTo(82.599, 0.001))
            jsonPath("$.alcoholAbv") { value(13.0) }
        }
        // Sauce: 247.797 / 600 × 100 = 41.2995 kcal /100g and 30.771 / 600 × 100 = 5.1285 g
        // alcohol /100g — all the alcohol conserved (ADR 0040).
        mockMvc.get("/api/foods/$sauce").andExpect {
            jsonPath("$.caloriesPer100g", closeTo(41.2995, 0.001))
            jsonPath("$.alcoholPer100g", closeTo(5.1285, 0.001))
        }
    }

    @Test
    fun `a past Entry of a corrected Food keeps its calories and protein but reads under the corrected name`() {
        val oats = createFood("Rolled oast", protein = 31.0, carbs = 60.0, fat = 7.0) // 427 kcal /100g
        mockMvc.post("/api/entries/weighed") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"2026-01-01","foodId":$oats,"grams":50.0}"""
        }.andExpect { status { isCreated() } }

        correct(oats, "Rolled oats", Macros(proteinPer100g = 13.0, carbsPer100g = 60.0, fatPer100g = 7.0))

        mockMvc.get("/api/entries") { param("date", "2026-01-01") }.andExpect {
            jsonPath("$.entries.length()") { value(1) }
            jsonPath("$.entries[0].name") { value("Rolled oats") }
            jsonPath("$.entries[0].calories", closeTo(213.5, 0.001))
            jsonPath("$.entries[0].protein", closeTo(15.5, 0.001))
        }
    }

    @Test
    fun `a correction naming a Tag the User does not have is refused as absent, and nothing is written`() {
        val mince = createFood("Mince", protein = 31.0, carbs = 0.0, fat = 10.0) // 214 kcal /100g
        val stew = createRecipe("Stew", 300.0, mince to 300.0)

        mockMvc.put("/api/foods/$mince") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Beef mince","proteinPer100g":13.0,"carbsPer100g":0.0,"fatPer100g":10.0,
                          "tagIds":[999999]}"""
        }.andExpect {
            status { isNotFound() }
            jsonPath("$.message") { value("no Food with id $mince, or no Tag among [999999]") }
        }

        mockMvc.get("/api/foods/$mince").andExpect {
            jsonPath("$.name") { value("Mince") }
            jsonPath("$.proteinPer100g", closeTo(31.0, 0.001))
            jsonPath("$.tags.length()") { value(0) }
        }
        mockMvc.get("/api/foods/$stew").andExpect {
            jsonPath("$.caloriesPer100g", closeTo(214.0, 0.001))
        }
    }

    @Test
    fun `a Recipe cannot be corrected through the Food endpoint, and is left as it was`() {
        val mince = createFood("Mince", protein = 31.0, carbs = 0.0, fat = 10.0) // 214 kcal /100g
        val stew = createRecipe("Stew", 300.0, mince to 300.0)

        mockMvc.put("/api/foods/$stew") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Beef stew","proteinPer100g":13.0,"carbsPer100g":0.0,"fatPer100g":10.0,
                          "tagIds":[]}"""
        }.andExpect { status { isBadRequest() } }

        mockMvc.get("/api/foods/$stew").andExpect {
            jsonPath("$.name") { value("Stew") }
            jsonPath("$.kind") { value("RECIPE") }
            jsonPath("$.caloriesPer100g", closeTo(214.0, 0.001))
        }
    }

    @Test
    fun `a correction that does not say which Tags the Food carries is refused, and nothing is written`() {
        val oats = createFood("Rolled oast", protein = 31.0, carbs = 60.0, fat = 7.0)
        val breakfast = createTag("breakfast")
        mockMvc.put("/api/foods/$oats") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Rolled oast","proteinPer100g":31.0,"carbsPer100g":60.0,"fatPer100g":7.0,
                          "tagIds":[$breakfast]}"""
        }.andExpect { status { isOk() } }

        mockMvc.put("/api/foods/$oats") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Rolled oats","proteinPer100g":13.0,"carbsPer100g":60.0,"fatPer100g":7.0}"""
        }.andExpect { status { isBadRequest() } }

        mockMvc.get("/api/foods/$oats").andExpect {
            jsonPath("$.name") { value("Rolled oast") }
            jsonPath("$.tags.length()") { value(1) }
        }
    }

    @Test
    fun `a correction of a matched Food's name and macros leaves what it borrows from unchanged`() {
        val cheese = createFood("Tasty chese", protein = 52.0, carbs = 0.0, fat = 33.0)
        val cheddar = referenceFoods
            .search(ReferenceFoodQuery.of("Tasty cheese", referenceFoods.synonyms()), limit = 1)
            .first().food
        mockMvc.put("/api/foods/$cheese/reference-food") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"referenceFoodId":${cheddar.id}}"""
        }.andExpect { status { isOk() } }

        correct(cheese, "Tasty cheese", Macros(proteinPer100g = 25.0, carbsPer100g = 0.0, fatPer100g = 33.0))

        mockMvc.get("/api/foods/$cheese").andExpect {
            jsonPath("$.name") { value("Tasty cheese") }
            jsonPath("$.referenceFoodId") { value(cheddar.id) }
            jsonPath("$.referenceFoodName") { value(cheddar.name) }
        }
    }

    private fun correct(id: Long, name: String, macros: Macros, alcoholAbv: Double? = null) {
        mockMvc.put("/api/foods/$id") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"$name","proteinPer100g":${macros.proteinPer100g},
                          "carbsPer100g":${macros.carbsPer100g},"fatPer100g":${macros.fatPer100g},
                          "fibrePer100g":${macros.fibrePer100g},"alcoholAbv":$alcoholAbv,"tagIds":[]}"""
        }.andExpect { status { isOk() } }
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

    private fun createTag(name: String): Long {
        val body = mockMvc.post("/api/tags") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"$name"}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        return objectMapper.readTree(body).get("id").asLong()
    }
}
