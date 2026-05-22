package com.tucker.api

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

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class SetupApiTest {

    @Autowired lateinit var mockMvc: MockMvc

    @Test
    fun `set up the profile, goal and weight, then run a weekly review`() {
        val today = LocalDate.now()

        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0}"""
        }.andExpect { status { isOk() } }

        mockMvc.post("/api/goal") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"startedOn":"2026-05-01","startWeightKg":90.0,
                          "targetWeightKg":80.0,"rateKgPerWeek":0.5}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.dailyDeficitKcal") { exists() }
        }

        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$today","weightKg":86.0}"""
        }.andExpect { status { isOk() } }

        mockMvc.post("/api/weekly-review").andExpect {
            status { isCreated() }
            jsonPath("$.calorieBudgetKcal") { exists() }
            jsonPath("$.proteinFloorG") { exists() }
        }

        mockMvc.get("/api/weekly-review").andExpect { status { isOk() } }
    }

    @Test
    fun `a goal whose target is above the start weight is rejected with 400`() {
        mockMvc.post("/api/goal") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"startedOn":"2026-05-01","startWeightKg":80.0,
                          "targetWeightKg":90.0,"rateKgPerWeek":0.5}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `running a weekly review with no Goal set is a 409`() {
        mockMvc.post("/api/weekly-review").andExpect { status { isConflict() } }
    }
}
