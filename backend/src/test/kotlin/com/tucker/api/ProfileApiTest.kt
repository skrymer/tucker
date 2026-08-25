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

    /**
     * A set-up User with today's review already run — the state a toggle has to act
     * on, because the Budget on `/` comes from that review and the cadence would
     * otherwise hold it for up to a week.
     */
    private fun userReviewedOn(today: LocalDate, tracksCalories: Boolean = true) {
        savedTrackingChoice(today, tracksCalories)

        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$today","weightKg":86.0,"clientToday":"$today"}"""
        }.andExpect { status { isOk() } }

        mockMvc.post("/api/weekly-review?clientToday=$today").andExpect {
            status { isOk() }
            jsonPath("$.intakeTargets") { if (tracksCalories) isNotEmpty() else value(null) }
        }
    }

    /** Save the body stats with a Calorie Tracking choice, stamped on the user's day. */
    private fun savedTrackingChoice(today: LocalDate, tracksCalories: Boolean) {
        mockMvc.put("/api/profile?clientToday=$today") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0,
                          "tracksCalories":$tracksCalories}"""
        }.andExpect { status { isOk() } }
    }

    @Test
    fun `turning Calorie Tracking off drops today's targets the same day`() {
        val today = LocalDate.now()
        userReviewedOn(today)

        savedTrackingChoice(today, tracksCalories = false)

        // Today's review is recomputed in place (ADR 0008's trigger, for the same
        // reason): without it a stale Budget lingers on `/` for up to a week.
        mockMvc.get("/api/weekly-review").andExpect {
            status { isOk() }
            jsonPath("$.reviewedOn") { value("$today") }
            jsonPath("$.intakeTargets") { value(null) }
        }
    }

    @Test
    fun `turning Calorie Tracking on brings today's targets back the same day`() {
        val today = LocalDate.now()
        userReviewedOn(today, tracksCalories = false)

        savedTrackingChoice(today, tracksCalories = true)

        // Turning it on is a real re-entry, not a promise for next week: the Budget
        // appears today, seeded from the current Trend Weight (ADR 0024).
        mockMvc.get("/api/weekly-review").andExpect {
            status { isOk() }
            jsonPath("$.reviewedOn") { value("$today") }
            jsonPath("$.intakeTargets.maintenanceBasis") { value("FORMULA_SEED") }
            jsonPath("$.intakeTargets.calorieBudgetKcal") { isNumber() }
        }
    }
}
