package com.tucker.api

import org.hamcrest.Matchers.closeTo
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class WeightApiTest {

    @Autowired lateinit var mockMvc: MockMvc

    @Test
    fun `GET weight latest returns the newest measurement`() {
        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"2026-05-20","weightKg":85.0}"""
        }.andExpect { status { isOk() } }

        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"2026-05-22","weightKg":84.2}"""
        }.andExpect { status { isOk() } }

        mockMvc.get("/api/weight/latest").andExpect {
            status { isOk() }
            jsonPath("$.measuredOn") { value("2026-05-22") }
            jsonPath("$.weightKg", closeTo(84.2, 1e-3))
        }
    }

    @Test
    fun `GET weight latest returns 404 when no measurements exist`() {
        mockMvc.get("/api/weight/latest").andExpect { status { isNotFound() } }
    }

    @Test
    fun `GET weight trend returns the live EWMA trend point dated the latest reading`() {
        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"2026-06-10","weightKg":107.0}"""
        }.andExpect { status { isOk() } }
        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"2026-06-11","weightKg":107.5}"""
        }.andExpect { status { isOk() } }

        // EWMA (α = 0.10): 0.1·107.5 + 0.9·107.0 = 107.05, dated the latest reading.
        mockMvc.get("/api/weight/trend").andExpect {
            status { isOk() }
            jsonPath("$.trendKg", closeTo(107.05, 1e-3))
            jsonPath("$.asOf") { value("2026-06-11") }
        }
    }

    @Test
    fun `GET weight trend returns 404 when no measurements exist`() {
        mockMvc.get("/api/weight/trend").andExpect { status { isNotFound() } }
    }

    @Test
    fun `DELETE weight removes the measurement and 404s on a re-fetch`() {
        val saved = mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"2026-05-20","weightKg":85.0}"""
        }.andExpect { status { isOk() } }
            .andReturn().response.contentAsString
        val id = Regex("""\"id\":(\d+)""").find(saved)!!.groupValues[1]

        mockMvc.delete("/api/weight/$id").andExpect { status { isNoContent() } }

        mockMvc.get("/api/weight/latest").andExpect { status { isNotFound() } }
    }

    @Test
    fun `POST weight rejects a future date with 400`() {
        val today = LocalDate.now()
        val tomorrow = today.plusDays(1)
        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$tomorrow","weightKg":84.2,"clientToday":"$today"}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `POST weight accepts today's weight when the client is a day ahead of the server`() {
        // Client's local date has rolled past midnight while the server (UTC) is
        // still on the previous day — the #24 boundary. The default-dated weight
        // (measuredOn == the client's today) must still be accepted.
        val clientToday = LocalDate.now().plusDays(1)
        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$clientToday","weightKg":84.2,"clientToday":"$clientToday"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.measuredOn") { value("$clientToday") }
        }
    }

    @Test
    fun `POST weight rejects an implausible client date more than a day from the server`() {
        // No real timezone shifts the local date by more than a day, so a
        // clientToday this far out is a bad clock, not a boundary — reject it.
        val clientToday = LocalDate.now().plusDays(2)
        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$clientToday","weightKg":84.2,"clientToday":"$clientToday"}"""
        }.andExpect { status { isBadRequest() } }
    }
}
