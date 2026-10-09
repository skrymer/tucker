package com.tucker.api

import com.tucker.persistence.AggregateRepository
import com.tucker.persistence.EntryRepository
import com.tucker.persistence.FoodRepository
import com.tucker.persistence.WeightMeasurementRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import java.time.LocalDate
import kotlin.test.assertEquals

/**
 * A create takes its id in the same transaction as the row it stores (ADR 0036), so a
 * request refused after taking one leaves the sequence where it was. Deliberately not
 * `@Transactional`: inside a test's own transaction every statement shares one, and the
 * request's boundary could not be seen. Each request here is refused, so nothing but the
 * sequence's own draws is committed.
 */
@SpringBootTest
@AutoConfigureMockMvc
class RefusedCreateTakesNoIdTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var entries: EntryRepository
    @Autowired lateinit var foods: FoodRepository
    @Autowired lateinit var weights: WeightMeasurementRepository

    private val today = LocalDate.now()

    /** Draw an id from [repository] around [refused], asserting the request took none. */
    private fun assertTakesNoId(repository: AggregateRepository, refused: () -> Unit) {
        val before = repository.nextId()

        refused()

        assertEquals(before + 1, repository.nextId(), "the refused request drew an id")
    }

    @Test
    fun `logging a weighed Entry of a Food that does not exist takes no Entry id`() {
        assertTakesNoId(entries) {
            mockMvc.post("/api/entries/weighed") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"date":"$today","foodId":999999999,"grams":100.0}"""
            }.andExpect { status { isNotFound() } }
        }
    }

    @Test
    fun `logging an estimated Entry dated past tomorrow takes no Entry id`() {
        assertTakesNoId(entries) {
            mockMvc.post("/api/entries/estimated") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"date":"${today.plusDays(2)}","label":"Dinner out","calories":800.0,""" +
                    """"protein":null,"clientToday":"$today"}"""
            }.andExpect { status { isBadRequest() } }
        }
    }

    @Test
    fun `creating a Food with negative protein takes no Food id`() {
        assertTakesNoId(foods) {
            mockMvc.post("/api/foods") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Oats","proteinPer100g":-1.0,"carbsPer100g":60.0,"fatPer100g":7.0,"tagIds":[]}"""
            }.andExpect { status { isBadRequest() } }
        }
    }

    @Test
    fun `creating a Recipe of a Food that does not exist takes no Food id`() {
        assertTakesNoId(foods) {
            mockMvc.post("/api/recipes") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Porridge","cookedWeightG":300.0,""" +
                    """"ingredients":[{"foodId":999999999,"grams":80.0}],"tagIds":[]}"""
            }.andExpect { status { isNotFound() } }
        }
    }

    @Test
    fun `recording a weigh-in dated tomorrow takes no Weight Measurement id`() {
        assertTakesNoId(weights) {
            mockMvc.post("/api/weight") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"date":"${today.plusDays(1)}","weightKg":86.0,"clientToday":"$today"}"""
            }.andExpect { status { isBadRequest() } }
        }
    }
}
