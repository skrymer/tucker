package com.tucker.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put
import org.springframework.transaction.annotation.Transactional

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ProfileApiTest {

    @Autowired lateinit var mockMvc: MockMvc

    @Test
    fun `PUT then GET round-trips the timezone, reminder hour, and reminders-enabled flag`() {
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0,
                          "timezone":"Europe/Copenhagen","reminderHour":8,"remindersEnabled":true}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.timezone") { value("Europe/Copenhagen") }
            jsonPath("$.reminderHour") { value(8) }
            jsonPath("$.remindersEnabled") { value(true) }
        }

        mockMvc.get("/api/profile").andExpect {
            status { isOk() }
            jsonPath("$.sex") { value("MALE") }
            jsonPath("$.timezone") { value("Europe/Copenhagen") }
            jsonPath("$.reminderHour") { value(8) }
            jsonPath("$.remindersEnabled") { value(true) }
        }
    }

    /**
     * Editing a Profile is the ordinary case — the setup form is a PUT whether or not
     * one exists — and it is the case a per-User Profile can newly get wrong. The row is
     * now found by owner rather than by the constant id 1, and `user_id` is uniquely
     * indexed, so a save that took the insert branch a second time would not quietly
     * duplicate: it would fail the constraint and 500 on every edit anyone ever makes.
     */
    @Test
    fun `saving a profile again replaces the caller's own rather than adding a second`() {
        savedProfile(heightCm = 180.0, timezone = "Europe/Copenhagen", reminderHour = 8)

        savedProfile(heightCm = 178.5, timezone = "Australia/Brisbane", reminderHour = 21)

        mockMvc.get("/api/profile").andExpect {
            status { isOk() }
            jsonPath("$.heightCm") { value(178.5) }
            jsonPath("$.timezone") { value("Australia/Brisbane") }
            jsonPath("$.reminderHour") { value(21) }
        }
    }

    /** PUT a complete Profile, asserting it was accepted. */
    private fun savedProfile(heightCm: Double, timezone: String, reminderHour: Int) {
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":$heightCm,
                          "timezone":"$timezone","reminderHour":$reminderHour,
                          "remindersEnabled":true}"""
        }.andExpect { status { isOk() } }
    }

    @Test
    fun `a profile saved with only body stats reads back the safe defaults`() {
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"FEMALE","birthDate":"1990-01-01","heightCm":165.0}"""
        }.andExpect { status { isOk() } }

        mockMvc.get("/api/profile").andExpect {
            status { isOk() }
            jsonPath("$.timezone") { value("UTC") }
            jsonPath("$.reminderHour") { value(9) }
            jsonPath("$.remindersEnabled") { value(false) }
            // Calorie Tracking defaults *on*: an omitted field is a client that
            // predates the setting, not a User giving up half the app.
            jsonPath("$.tracksCalories") { value(true) }
        }
    }

    /**
     * Calorie Tracking is a deliberate setting the User owns, never inferred from a
     * quiet fortnight (CONTEXT.md), so it has to survive the round trip like any other
     * Profile field rather than being re-derived on read.
     */
    @Test
    fun `PUT then GET round-trips Calorie Tracking turned off`() {
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0,
                          "tracksCalories":false}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.tracksCalories") { value(false) }
        }

        mockMvc.get("/api/profile").andExpect {
            status { isOk() }
            jsonPath("$.tracksCalories") { value(false) }
        }
    }
}
