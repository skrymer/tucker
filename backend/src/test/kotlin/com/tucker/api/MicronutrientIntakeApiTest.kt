package com.tucker.api

import com.fasterxml.jackson.databind.ObjectMapper
import com.tucker.domain.ReferenceFoodQuery
import com.tucker.persistence.ReferenceFoodRepository
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
 * `GET /api/micronutrient-intake?from=&to=` — what a window's matched food supplied
 * per nutrient, read against the lines published for this User's body, plus how much
 * of the window could supply anything at all and what is left to match (ADR 0027).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithTuckerUser
class MicronutrientIntakeApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var referenceFoods: ReferenceFoodRepository

    private val day = LocalDate.of(2026, 8, 27)
    private val weekStart = day.minusDays(6)

    @Test
    fun `the window states its coverage and ranks what is left to match`() {
        // Protein alone, so 100 g is 4x25 = 100 kcal and every figure below is exact —
        // a sum of thirds would only be asserting how doubles round.
        val cheese = createFood("Tasty cheese")
        val rice = createFood("Jasmine rice")
        val oats = createFood("Rolled oats")
        match(cheese, referenceFoodFor("Tasty cheese"))
        logWeighed(cheese, grams = 200.0)
        logWeighed(rice, grams = 100.0)
        logWeighed(oats, grams = 50.0)

        mockMvc.get("/api/micronutrient-intake") {
            param("from", "$weekStart")
            param("to", "$day")
        }.andExpect {
            status { isOk() }
            jsonPath("$.from") { value("$weekStart") }
            jsonPath("$.to") { value("$day") }
            jsonPath("$.totalCalories") { value(350.0) }
            jsonPath("$.coverage") { value(200.0 / 350.0) }
            jsonPath("$.unmatched.length()") { value(2) }
            jsonPath("$.unmatched[0].name") { value("Jasmine rice") }
            jsonPath("$.unmatched[0].foodId") { value(rice) }
            jsonPath("$.unmatched[0].share") { value(100.0 / 350.0) }
            jsonPath("$.unmatched[1].name") { value("Rolled oats") }
            // Everything above was logged on one day of the seven, and the claim the
            // card makes is exactly as strong as that (ADR 0026).
            jsonPath("$.loggedDays") { value(1) }
            // The unit travels with the figure, because 0.4 µg of iodine and 490 mg of
            // sodium are the same number and nothing else.
            jsonPath("$.rows[?(@.nutrient == 'IODINE')].unit") { value("µg") }
            jsonPath("$.rows[?(@.nutrient == 'CALCIUM')].unit") { value("mg") }
        }
    }

    @Test
    fun `each nutrient is read against the line published for this User's body`() {
        // 56, so the band in force is 51-70 — where a woman's calcium is 1,300 mg
        // and a man's is 1,000. Reading the wrong sex gives the wrong figure here.
        seedProfile(sex = "FEMALE", birthDate = "1970-03-14")
        eatEnoughCheeseToClearCalcium()

        mockMvc.get("/api/micronutrient-intake") {
            param("from", "$weekStart")
            param("to", "$day")
        }.andExpect {
            status { isOk() }
            jsonPath("$.rows[?(@.nutrient == 'CALCIUM')].recommended") { value(1300.0) }
            jsonPath("$.rows[?(@.nutrient == 'CALCIUM')].limit.amount") { value(2500.0) }
            jsonPath("$.rows[?(@.nutrient == 'CALCIUM')].limit.kind") { value("UPPER_LEVEL") }
        }
    }

    @Test
    fun `a nutrient Tucker cannot claim is published without figures at all`() {
        seedProfile(sex = "MALE", birthDate = "1990-06-15")
        val cheese = createFood("Tasty cheese")
        match(cheese, referenceFoodFor("Tasty cheese"))
        logWeighed(cheese, grams = 100.0)

        mockMvc.get("/api/micronutrient-intake") {
            param("from", "$weekStart")
            param("to", "$day")
        }.andExpect {
            status { isOk() }
            // 100 g of cheddar over a week is nowhere near any published figure, so
            // every nutrient here is NOT_ENOUGH_MATCHED.
            jsonPath("$.rows[?(@.nutrient == 'CALCIUM')].claim") { value("NOT_ENOUGH_MATCHED") }
            // A shortfall is not published, so there is nothing on the wire to draw
            // one from — the rule is a fact about the response rather than a
            // convention every client has to keep (ADR 0027).
            jsonPath("$.rows[?(@.nutrient == 'CALCIUM')].amount") { value(null) }
            jsonPath("$.rows[?(@.nutrient == 'CALCIUM')].recommended") { value(null) }
            jsonPath("$.rows[?(@.nutrient == 'CALCIUM')].limit") { value(null) }
            // The name survives, because the absence is stated by naming it.
            jsonPath("$.rows[?(@.nutrient == 'CALCIUM')].label") { value("Calcium") }
        }
    }

    @Test
    fun `the wire says whether there was a body to read the window against`() {
        val cheese = createFood("Tasty cheese")
        match(cheese, referenceFoodFor("Tasty cheese"))
        logWeighed(cheese, grams = 100.0)

        mockMvc.get("/api/micronutrient-intake") {
            param("from", "$weekStart")
            param("to", "$day")
        }.andExpect {
            status { isOk() }
            // No Profile, so nothing resolved and no amount of matching will earn a
            // claim — which is advice about the Profile, not about food. Without this
            // field that state is identical on the wire to a poorly matched week, and
            // the two earn opposite advice (ADR 0027).
            jsonPath("$.hasReferenceIntakes") { value(false) }
        }

        seedProfile(sex = "MALE", birthDate = "1990-06-15")

        mockMvc.get("/api/micronutrient-intake") {
            param("from", "$weekStart")
            param("to", "$day")
        }.andExpect {
            status { isOk() }
            // The same window, matched exactly as poorly, now has a body behind it.
            jsonPath("$.hasReferenceIntakes") { value(true) }
            jsonPath("$.rows[?(@.nutrient == 'CALCIUM')].claim") { value("NOT_ENOUGH_MATCHED") }
        }
    }

    @Test
    fun `a window spanning a birthday is read against one band, the one it ends in`() {
        // 25 August 1975: 50 on the Tuesday this window opens and 51 on the Monday it
        // closes. A woman's calcium moves from 1,000 mg to 1,300 mg at exactly that
        // birthday, which is what makes the two readings tell apart.
        seedProfile(sex = "FEMALE", birthDate = "1975-08-25")
        eatEnoughCheeseToClearCalcium()

        mockMvc.get("/api/micronutrient-intake") {
            param("from", "$weekStart")
            param("to", "$day")
        }.andExpect {
            status { isOk() }
            jsonPath("$.rows[?(@.nutrient == 'CALCIUM')].recommended") { value(1300.0) }
        }
    }

    /**
     * 1.4 kg of AFCD's cheddar (760 mg calcium per 100 g) over the window, which is
     * 1,520 mg a day — past every calcium band, so the row earns a claim and with it
     * the figures it was read against.
     */
    private fun eatEnoughCheeseToClearCalcium() {
        val cheese = createFood("Tasty cheese")
        match(cheese, referenceFoodFor("Tasty cheese"))
        logWeighed(cheese, grams = 1400.0)
    }

    private fun seedProfile(sex: String, birthDate: String) {
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"$sex","birthDate":"$birthDate","heightCm":170.0}"""
        }.andExpect { status { isOk() } }
    }

    private fun referenceFoodFor(text: String): Long =
        referenceFoods.search(ReferenceFoodQuery.of(text, referenceFoods.synonyms()), limit = 1)
            .first().food.id

    private fun createFood(name: String): Long {
        val body = mockMvc.post("/api/foods") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"$name","proteinPer100g":25.0,"carbsPer100g":0.0,"fatPer100g":0.0}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        return objectMapper.readTree(body).get("id").asLong()
    }

    private fun match(foodId: Long, referenceFoodId: Long) {
        mockMvc.put("/api/foods/$foodId/reference-food") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"referenceFoodId":$referenceFoodId}"""
        }.andExpect { status { isOk() } }
    }

    private fun logWeighed(foodId: Long, grams: Double) {
        mockMvc.post("/api/entries/weighed") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$day","foodId":$foodId,"grams":$grams}"""
        }.andExpect { status { isCreated() } }
    }
}
