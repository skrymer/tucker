package com.tucker.api

import com.fasterxml.jackson.databind.ObjectMapper
import com.tucker.domain.FrequentFoods
import com.tucker.security.WithTuckerUser
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
import java.time.LocalDate

/**
 * `GET /api/foods/frequent` — the caller's **Frequent Foods** (ADR 0028) over the
 * trailing 30 days, a window the client supplies (ADR 0014).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithTuckerUser
class FoodFrequentApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper

    private val to = LocalDate.of(2026, 9, 6)
    private val from = to.minusDays(FrequentFoods.WINDOW_DAYS - 1L)

    private fun idOf(json: String): Long = objectMapper.readTree(json).get("id").asLong()

    private fun createFood(name: String): Long {
        val body = mockMvc.post("/api/foods") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"$name","proteinPer100g":31.0,"carbsPer100g":0.0,"fatPer100g":3.6,"tagIds":[]}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        return idOf(body)
    }

    private fun logWeighed(foodId: Long, on: LocalDate = to) {
        mockMvc.post("/api/entries/weighed") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$on","foodId":$foodId,"grams":100.0}"""
        }.andExpect { status { isCreated() } }
    }

    private fun frequent() = mockMvc.get("/api/foods/frequent") {
        param("from", "$from")
        param("to", "$to")
    }

    @Test
    fun `the Foods are returned most logged first, each carrying what the catalog shows`() {
        val oats = createFood("Rolled oats")
        val eggs = createFood("Free-range eggs")
        repeat(2) { logWeighed(oats) }
        repeat(5) { logWeighed(eggs) }

        frequent().andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(2) }
            jsonPath("$[0].id") { value(eggs) }
            jsonPath("$[0].name") { value("Free-range eggs") }
            // 4x31 + 9x3.6 = 156.4 — the same per-100g figures the catalog row carries,
            // because the grid cell states them too.
            jsonPath("$[0].caloriesPer100g") { value(156.4) }
            jsonPath("$[0].proteinPer100g") { value(31.0) }
            jsonPath("$[0].kind") { value("FOOD") }
            jsonPath("$[1].id") { value(oats) }
        }
    }

    @Test
    fun `a Frequent Food lists the Tags it carries, as the catalog does`() {
        val oats = createFood("Rolled oats")
        val breakfast = idOf(
            mockMvc.post("/api/tags") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"breakfast"}"""
            }.andReturn().response.contentAsString,
        )
        mockMvc.put("/api/foods/$oats/tags") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"tagIds":[$breakfast]}"""
        }.andExpect { status { isOk() } }
        logWeighed(oats)

        frequent().andExpect {
            jsonPath("$[0].tags.length()") { value(1) }
            jsonPath("$[0].tags[0].id") { value(breakfast) }
            jsonPath("$[0].tags[0].name") { value("breakfast") }
        }
    }

    @Test
    fun `an Estimated Entry names no Food, so it never ranks`() {
        val oats = createFood("Rolled oats")
        logWeighed(oats)
        repeat(6) {
            mockMvc.post("/api/entries/estimated") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"date":"$to","label":"Work canteen","calories":640.0,"protein":30.0}"""
            }.andExpect { status { isCreated() } }
        }

        frequent().andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value(oats) }
        }
    }

    @Test
    fun `a Food logged only before the window falls out of the ranking`() {
        val oats = createFood("Rolled oats")
        val dropped = createFood("Sourdough starter loaf")
        logWeighed(oats)
        repeat(9) { logWeighed(dropped, on = from.minusDays(1)) }

        frequent().andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value(oats) }
        }
    }

    @Test
    fun `a Recipe ranks like any other Food and arrives marked as one`() {
        val mince = createFood("Kangaroo mince")
        val chilli = mockMvc.post("/api/recipes") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Weekday chilli","cookedWeightG":900.0,
                          "ingredients":[{"foodId":$mince,"grams":500.0}],"tagIds":[]}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString.let(::idOf)
        logWeighed(chilli)

        frequent().andExpect {
            status { isOk() }
            jsonPath("$[0].id") { value(chilli) }
            jsonPath("$[0].kind") { value("RECIPE") }
            // The count comes from another table, and the grid marks a Recipe from
            // this response alone — so it has to arrive by this route too, not only
            // by the catalog's.
            jsonPath("$[0].ingredientCount") { value(1) }
        }
    }

    @Test
    fun `asking about any window but the trailing thirty days is a bad request`() {
        mockMvc.get("/api/foods/frequent") {
            param("from", "${from.plusDays(1)}")
            param("to", "$to")
        }.andExpect { status { isBadRequest() } }
    }
}
