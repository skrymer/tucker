package com.tucker.api

import com.tucker.security.ACCESS_ASSERTION_HEADER
import com.tucker.security.AccessTokens
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate
import kotlin.test.assertTrue

/**
 * The days a User logged in a calendar's visible grid, and their first Entry's date.
 *
 * Signed in as a User of its own rather than `tester`, whose Entries other suites
 * may have committed to the shared test database.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class LoggedDaysApiTest {

    @Autowired lateinit var mockMvc: MockMvc

    private val user = AccessTokens.mint(email = "logged-days@tucker.invalid")

    private fun logEstimated(on: LocalDate) {
        mockMvc.post("/api/entries/estimated") {
            header(ACCESS_ASSERTION_HEADER, user)
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$on","label":"Lunch out","calories":600.0,"protein":30.0}"""
        }.andExpect { status { isCreated() } }
    }

    private fun loggedDays(from: String, to: String) =
        mockMvc.get("/api/entries/days") {
            header(ACCESS_ASSERTION_HEADER, user)
            param("from", from)
            param("to", to)
        }

    @Test
    fun `lists each day in the range that holds Entries once, ascending`() {
        logEstimated(LocalDate.of(2026, 10, 8))
        logEstimated(LocalDate.of(2026, 10, 7))
        logEstimated(LocalDate.of(2026, 10, 7))

        loggedDays(from = "2026-09-28", to = "2026-11-08").andExpect {
            status { isOk() }
            jsonPath("$.days.length()") { value(2) }
            jsonPath("$.days[0]") { value("2026-10-07") }
            jsonPath("$.days[1]") { value("2026-10-08") }
        }
    }

    @Test
    fun `both ends of the range are included, and the days just outside it are not`() {
        logEstimated(LocalDate.of(2026, 6, 28))
        logEstimated(LocalDate.of(2026, 6, 29))
        logEstimated(LocalDate.of(2026, 8, 9))
        logEstimated(LocalDate.of(2026, 8, 10))

        loggedDays(from = "2026-06-29", to = "2026-08-09").andExpect {
            status { isOk() }
            jsonPath("$.days.length()") { value(2) }
            jsonPath("$.days[0]") { value("2026-06-29") }
            jsonPath("$.days[1]") { value("2026-08-09") }
        }
    }

    @Test
    fun `firstLoggedOn is the User's earliest Entry, wherever the range is`() {
        logEstimated(LocalDate.of(2026, 10, 7))
        logEstimated(LocalDate.of(2026, 3, 14))
        logEstimated(LocalDate.of(2026, 6, 12))

        loggedDays(from = "2026-09-28", to = "2026-11-08").andExpect {
            status { isOk() }
            jsonPath("$.firstLoggedOn") { value("2026-03-14") }
        }
    }

    @Test
    fun `a User with no Entries has no days and an explicit null firstLoggedOn`() {
        val body = loggedDays(from = "2026-09-28", to = "2026-11-08").andExpect {
            status { isOk() }
            jsonPath("$.days") { isEmpty() }
        }.andReturn().response.contentAsString

        // Explicitly null, not omitted (ADR 0023); JsonPath cannot tell the two apart.
        assertTrue(body.contains(""""firstLoggedOn":null"""), "expected an explicit null, body was $body")
    }

    @Test
    fun `a range that ends before it starts is refused with 400`() {
        loggedDays(from = "2026-10-08", to = "2026-10-07").andExpect { status { isBadRequest() } }
    }

    @Test
    fun `a range of 62 days is answered`() {
        loggedDays(from = "2026-09-01", to = "2026-11-01").andExpect { status { isOk() } }
    }

    @Test
    fun `a range of one day is answered`() {
        logEstimated(LocalDate.of(2026, 10, 7))

        loggedDays(from = "2026-10-07", to = "2026-10-07").andExpect {
            status { isOk() }
            jsonPath("$.days[0]") { value("2026-10-07") }
        }
    }

    @Test
    fun `a range of 63 days is refused with 400`() {
        loggedDays(from = "2026-09-01", to = "2026-11-02").andExpect { status { isBadRequest() } }
    }
}
