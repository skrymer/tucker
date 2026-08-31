package com.tucker.api

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.tucker.domain.Micronutrient
import com.tucker.security.WithTuckerUser
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.transaction.annotation.Transactional
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * `GET /api/reference-foods?q=` — the search a User finds a **Reference Food**
 * through, and the one thing standing between them and a match (ADR 0027).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithTuckerUser
class ReferenceFoodApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper

    @Test
    fun `a search ranks its candidates and offers the best of them`() {
        val body = search("Tasty cheese")

        assertEquals(
            "Cheese, cheddar, natural, regular fat",
            body.get("candidates").first().get("name").asText(),
            "`cheddar cheese` is what the vernacular rewrite makes of it, and the corpus " +
                "knows no `tasty`",
        )
        assertEquals(
            body.get("candidates").first().get("id").asLong(),
            body.get("suggestedId").asLong(),
            "those words name the whole of the head `Cheese`, so the tap is offered",
        )
    }

    @Test
    fun `a blank query searches for nothing rather than for everything`() {
        assertEquals(
            0,
            search("   ").get("candidates").size(),
            "the picker asks on every keystroke, and an empty box asking for all 1,588 " +
                "Reference Foods is a list nobody can read",
        )
    }

    @Test
    fun `a food the corpus does not hold is an empty list rather than a not found`() {
        val body = search("Sourdough")

        assertEquals(0, body.get("candidates").size(), "AFCD is generic staples, not a catalogue")
        assertTrue(
            body.get("suggestedId").isNull,
            "nothing to offer, and an empty answer is the honest one — the coverage ceiling " +
                "is real and a 404 would read as the search being broken (ADR 0027)",
        )
    }

    @Test
    fun `no candidate is offered when the best one is named for more than was asked for`() {
        val body = search("Almonds")

        assertTrue(
            body.get("candidates").first().get("name").asText().startsWith("Almond beverage"),
            "head-noun boosting backfires on a compound head starting with the query word, " +
                "which ADR 0027 accepts as a residual rather than solving",
        )
        assertTrue(
            body.get("suggestedId").isNull,
            "so the tap is withheld and the candidates are merely listed: an almond beverage " +
                "is not what anybody typing `Almonds` meant",
        )
    }

    @Test
    fun `every candidate carries the same figures, so the list reads down a column`() {
        val candidates = search("Milk").get("candidates").toList()

        val nutrients = candidates.map { candidate ->
            candidate.get("distinguishing").map { it.get("nutrient").asText() }
        }
        assertEquals(
            List(candidates.size) { nutrients.first() },
            nutrients,
            "the nutrients are chosen for the *set* — a row reporting different ones from " +
                "its neighbour answers a question nobody asked",
        )
        val first = candidates.first().get("distinguishing").first()
        assertEquals(3, candidates.first().get("distinguishing").size(), "three fit a phone subline")
        assertEquals(
            listOf("nutrient", "label", "unit", "amount"),
            first.fieldNames().asSequence().toList(),
            "a figure is unreadable without its unit, and a nutrient key is not a label",
        )
        assertTrue(first.get("amount").isNumber, "the amount is per 100 g of this Reference Food")
    }

    @Test
    fun `each figure names its nutrient in words, with the unit it is measured in`() {
        val figures = search("Beef mince")
            .get("candidates").first()
            .get("distinguishing").toList()
            .map { it.get("nutrient").asText() to it }

        // Tucker names the nutrients so nothing downstream has to: the client renders
        // `label` and `unit` verbatim, so a blank either side is a blank on screen.
        assertTrue(
            figures.all { (_, figure) ->
                figure.get("label").asText().isNotBlank() &&
                    figure.get("unit").asText().isNotBlank()
            },
            "every figure needs a name and a unit to be readable at all, was: $figures",
        )
        assertEquals(
            setOf("g", "mg", "µg"),
            Micronutrient.entries.map { it.unit }.toSet(),
            "and the units are the three AFCD reports in — a fourth is a parse that " +
                "went wrong, or a nutrient nobody has decided how to show",
        )
    }

    private fun search(q: String): JsonNode {
        val body = mockMvc.get("/api/reference-foods") { param("q", q) }
            .andExpect { status { isOk() } }
            .andReturn().response.contentAsString
        return objectMapper.readTree(body)
    }
}
