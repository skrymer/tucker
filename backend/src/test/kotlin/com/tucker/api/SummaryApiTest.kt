package com.tucker.api

import com.tucker.domain.Goal
import com.tucker.domain.IntakeTargets
import com.tucker.domain.Maintenance
import com.tucker.domain.WeeklyReview
import com.tucker.persistence.GoalRepository
import com.tucker.persistence.ReminderStateRepository
import com.tucker.persistence.WeeklyReviewRepository
import com.tucker.security.WithTuckerUser
import org.hamcrest.Matchers.closeTo
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
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithTuckerUser
class SummaryApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var reviews: WeeklyReviewRepository
    @Autowired lateinit var reminderState: ReminderStateRepository
    @Autowired lateinit var goals: GoalRepository

    /** A review inserted directly, standing in for one the adaptive engine ran. */
    private fun seedReview(
        on: LocalDate,
        budgetKcal: Double,
        floorG: Double,
    ): WeeklyReview =
        reviews.insert(
            WeeklyReview(
                id = null,
                reviewedOn = on,
                trendWeightKg = 86.0,
                intakeTargets = IntakeTargets(
                    maintenance = Maintenance(2400.0, Maintenance.Basis.FORMULA_SEED),
                    calorieBudgetKcal = budgetKcal,
                    proteinFloorG = floorG,
                ),
            ),
        )

    private fun completeSetup(on: LocalDate) {
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0}"""
        }.andExpect { status { isOk() } }

        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$on","weightKg":86.0}"""
        }.andExpect { status { isOk() } }

        mockMvc.post("/api/goal") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"startedOn":"$on",
                          "targetWeightKg":80.0,"rateKgPerWeek":0.5}"""
        }.andExpect { status { isCreated() } }
    }

    /** Maintenance Mode setup: profile + a weight reading, but no Goal. */
    private fun maintenanceSetup(on: LocalDate, tracksCalories: Boolean = true) {
        savedProfile(tracksCalories)

        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$on","weightKg":86.0}"""
        }.andExpect { status { isOk() } }
    }

    /** The body stats, with the Calorie Tracking choice under test. */
    private fun savedProfile(tracksCalories: Boolean = true) {
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0,
                          "tracksCalories":$tracksCalories}"""
        }.andExpect { status { isOk() } }
    }

    @Test
    fun `the summary reports setup incomplete while no Weight Measurement exists`() {
        val day = LocalDate.now()
        savedProfile()

        mockMvc.get("/api/summary") {
            param("date", "$day")
        }.andExpect {
            status { isOk() }
            // Weight is the spine (CONTEXT.md — Calorie Tracking): with no reading
            // there is no Trend Weight, so no review can run whatever the User counts.
            jsonPath("$.setupComplete") { value(false) }
        }
    }

    @Test
    fun `the summary reports setup complete once a Profile and a Weight Measurement exist`() {
        val day = LocalDate.now()
        maintenanceSetup(day)

        mockMvc.get("/api/summary") {
            param("date", "$day")
        }.andExpect {
            status { isOk() }
            jsonPath("$.setupComplete") { value(true) }
        }
    }

    @Test
    fun `with Calorie Tracking off the summary carries no Budget, Floor or day verdict, and setup is still complete`() {
        val day = LocalDate.now()
        maintenanceSetup(day, tracksCalories = false)

        val body = mockMvc.get("/api/summary") {
            param("date", "$day")
        }.andExpect {
            status { isOk() }
            // Finished setup, and nothing left to finish — the banner must not offer
            // to explain a calorie budget this User has chosen not to have.
            jsonPath("$.setupComplete") { value(true) }
            // The review still ran, so its other job is on the wire.
            jsonPath("$.trendWeightKg") { value(86.0) }
        }.andReturn().response.contentAsString

        // Explicitly null, not omitted (ADR 0023): the generated client reads the
        // `null` arm the wire actually carries, and `exists()` cannot tell the two
        // apart because a JSON null does not "exist" to JsonPath.
        listOf("calorieBudget", "proteinFloor", "caloriesRemaining", "proteinRemaining", "dayStatus")
            .forEach { field ->
                assertTrue(
                    body.contains(""""$field":null"""),
                    "expected $field to be an explicit null, body was $body",
                )
            }
    }

    @Test
    fun `in Maintenance Mode the summary reports a Maintenance budget, protein floor, and trend weight with no Goal`() {
        val day = LocalDate.now()
        maintenanceSetup(day)

        mockMvc.get("/api/summary") {
            param("date", "$day")
        }.andExpect {
            status { isOk() }
            // A review was bootstrapped: the Budget is present (Maintenance, no deficit).
            jsonPath("$.calorieBudget") { isNumber() }
            // Protein Floor = 2 g/kg of the trend (a single 86.0 reading → trend 86.0).
            jsonPath("$.proteinFloor") { value(172.0) }
            jsonPath("$.trendWeightKg") { value(86.0) }
            // Zero intake with the floor unmet — a fresh day in progress, no verdict yet.
            jsonPath("$.dayStatus") { value("in-progress") }
        }
    }

    @Test
    fun `in Maintenance Mode with too little history the summary reports drift gathering data and no rate`() {
        val day = LocalDate.now()
        maintenanceSetup(day)

        mockMvc.get("/api/summary") {
            param("date", "$day")
        }.andExpect {
            status { isOk() }
            // A single same-day reading is under 14 days of history.
            jsonPath("$.driftStatus") { value("gathering-data") }
            jsonPath("$.observedRateKgPerWeek") { value(null) }
        }
    }

    @Test
    fun `the summary reports what remains as the signed targets minus consumed`() {
        val day = LocalDate.of(2026, 6, 10)
        seedReview(day, budgetKcal = 2000.0, floorG = 140.0)
        mockMvc.post("/api/entries/estimated") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$day","label":"lunch","calories":500,"protein":90}"""
        }.andExpect { status { isCreated() } }

        // Read on the seeded review's own day, so no catch-up is due to disturb it.
        mockMvc.get("/api/summary") {
            param("date", "$day")
        }.andExpect {
            status { isOk() }
            // Both are signed, and both count *down*: 2000 − 500 kcal, 140 − 90 g.
            // Either sign flipped would read as a day with room to spare.
            jsonPath("$.caloriesRemaining") { value(1500.0) }
            jsonPath("$.proteinRemaining") { value(50.0) }
        }
    }

    @Test
    fun `the summary reports no day status before the first weekly review`() {
        // A fresh database has no WeeklyReview, so there is no Budget or Floor to
        // judge the day against — the verdict is withheld (null), unchanged from
        // the old null onTarget.
        val day = LocalDate.of(2026, 6, 10)

        mockMvc.get("/api/summary") {
            param("date", "$day")
        }.andExpect {
            status { isOk() }
            jsonPath("$.dayStatus") { value(null) }
        }
    }

    /** Seed a daily reading on each of the [days] dates ending [on], at [weight]. */
    private fun seedRisingWeights(on: LocalDate, days: Long, fromKg: Double, toKg: Double) {
        for (d in 0..days) {
            val date = on.minusDays(days - d)
            val weight = fromKg + (toKg - fromKg) * d / days
            mockMvc.post("/api/weight") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"date":"$date","weightKg":$weight}"""
            }.andExpect { status { isOk() } }
        }
    }

    @Test
    fun `in Maintenance Mode with a rising trend the summary reports drifting up and the observed rate`() {
        val day = LocalDate.now()
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0}"""
        }.andExpect { status { isOk() } }
        // A month of steadily rising weight, no Goal: the trend drifts up past the band.
        seedRisingWeights(day, days = 28, fromKg = 84.0, toKg = 86.0)

        mockMvc.get("/api/summary") {
            param("date", "$day")
        }.andExpect {
            status { isOk() }
            jsonPath("$.driftStatus") { value("drifting-up") }
            jsonPath("$.observedRateKgPerWeek") { isNumber() }
        }
    }

    @Test
    fun `with an active Goal the summary omits the drift fields — pace lives on the Goal`() {
        val day = LocalDate.now()
        completeSetup(day)

        mockMvc.get("/api/summary") {
            param("date", "$day")
        }.andExpect {
            status { isOk() }
            jsonPath("$.driftStatus") { value(null) }
            jsonPath("$.observedRateKgPerWeek") { value(null) }
        }
    }

    @Test
    fun `loading the summary a week after the last review fires a catch-up review dated today`() {
        val setupDay = LocalDate.now()
        completeSetup(setupDay)

        // The dashboard is read a week later — the local day the client supplies.
        val nextWeek = setupDay.plusWeeks(1)
        mockMvc.get("/api/summary") {
            param("date", "$nextWeek")
        }.andExpect { status { isOk() } }

        // The catch-up ran on the summary read: the latest review snapped to today.
        mockMvc.get("/api/weekly-review").andExpect {
            status { isOk() }
            jsonPath("$.reviewedOn") { value("$nextWeek") }
        }
    }

    @Test
    fun `the summary reports a budget change when the latest review differs from the previous`() {
        val prev = LocalDate.of(2026, 5, 15)
        val latest = prev.plusWeeks(1)
        seedReview(prev, budgetKcal = 1850.0, floorG = 172.0)
        val review = seedReview(latest, budgetKcal = 1800.0, floorG = 168.0)

        // Read on the latest review's day, so no catch-up is due to disturb it.
        mockMvc.get("/api/summary") {
            param("date", "$latest")
        }.andExpect {
            status { isOk() }
            jsonPath("$.budgetChange.reviewId") { value(review.id) }
            jsonPath("$.budgetChange.previousBudgetKcal") { value(1850.0) }
            jsonPath("$.budgetChange.newBudgetKcal") { value(1800.0) }
            jsonPath("$.budgetChange.previousFloorG") { value(172.0) }
            jsonPath("$.budgetChange.newFloorG") { value(168.0) }
        }
    }

    @Test
    fun `the summary reports no budget change across a Calorie Tracking gap`() {
        val gap = LocalDate.of(2026, 5, 15)
        val resumed = gap.plusWeeks(1)
        // Last week's review was run with Calorie Tracking off, so it has no Budget
        // to have moved from. A figure invented here would claim the Budget jumped
        // from nothing the moment the User came back.
        reviews.insert(WeeklyReview(id = null, reviewedOn = gap, trendWeightKg = 86.0, intakeTargets = null))
        seedReview(resumed, budgetKcal = 1800.0, floorG = 168.0)

        mockMvc.get("/api/summary") {
            param("date", "$resumed")
        }.andExpect {
            status { isOk() }
            jsonPath("$.budgetChange") { value(null) }
        }
    }

    @Test
    fun `the summary reports no budget change on the first-ever review`() {
        val first = LocalDate.of(2026, 5, 22)
        seedReview(first, budgetKcal = 1850.0, floorG = 172.0)

        mockMvc.get("/api/summary") {
            param("date", "$first")
        }.andExpect {
            status { isOk() }
            jsonPath("$.budgetChange") { value(null) }
        }
    }

    @Test
    fun `the summary reports no budget change when both figures render identically`() {
        // A real payload, seeded directly rather than produced by the engine: a held
        // review carries Maintenance forward so the Budget cannot move, while the
        // Protein Floor re-derives from a trend that drifted 200 g. Both figures here
        // render "143 g", and the banner announced "your weekly review changed your
        // targets" over two lines that read the same on both sides.
        val prev = LocalDate.of(2026, 5, 15)
        val latest = prev.plusWeeks(1)
        seedReview(prev, budgetKcal = 1702.166680161943, floorG = 142.638)
        seedReview(latest, budgetKcal = 1702.166680161943, floorG = 143.02)

        mockMvc.get("/api/summary") {
            param("date", "$latest")
        }.andExpect {
            status { isOk() }
            jsonPath("$.budgetChange") { value(null) }
        }
    }

    @Test
    fun `the summary reports a budget change when only the Protein Floor moved visibly`() {
        // The other side of the rounding rule: an unchanged Budget is not a reason to
        // stay quiet. The Floor crosses a whole gram here, so the banner's body has
        // something to show and the headline is true.
        val prev = LocalDate.of(2026, 5, 15)
        val latest = prev.plusWeeks(1)
        seedReview(prev, budgetKcal = 1702.166680161943, floorG = 142.4)
        seedReview(latest, budgetKcal = 1702.166680161943, floorG = 143.6)

        mockMvc.get("/api/summary") {
            param("date", "$latest")
        }.andExpect {
            status { isOk() }
            jsonPath("$.budgetChange.previousFloorG") { value(142) }
            jsonPath("$.budgetChange.newFloorG") { value(144) }
            jsonPath("$.budgetChange.previousBudgetKcal") { value(1702) }
            jsonPath("$.budgetChange.newBudgetKcal") { value(1702) }
        }
    }

    @Test
    fun `the summary reports no budget change when a review left the budget and floor unchanged`() {
        val prev = LocalDate.of(2026, 5, 15)
        val latest = prev.plusWeeks(1)
        seedReview(prev, budgetKcal = 1850.0, floorG = 172.0)
        seedReview(latest, budgetKcal = 1850.0, floorG = 172.0)

        mockMvc.get("/api/summary") {
            param("date", "$latest")
        }.andExpect {
            status { isOk() }
            jsonPath("$.budgetChange") { value(null) }
        }
    }

    @Test
    fun `reading the summary stamps the user's last-seen day for the absent-today gate`() {
        val day = LocalDate.of(2026, 6, 10)

        mockMvc.get("/api/summary") {
            param("date", "$day")
        }.andExpect { status { isOk() } }

        assertEquals(day, reminderState.lastSeenOn())
    }

    @Test
    fun `the summary stays up and reports a Suspended Deficit when the rate outruns Maintenance`() {
        // The outage (issue #305): a 50 kg, 160 cm, 40-year-old woman maintains on
        // 1594.6 kcal while a 1.5 kg/week Goal demands 1650, and GET /api/summary —
        // which runs the lazy catch-up — used to 400 every day it lasted.
        // The Goal is inserted directly because POST /api/goal now refuses this rate;
        // reaching the state means a Goal set back when Maintenance was higher.
        val day = LocalDate.of(2026, 6, 10)
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"FEMALE","birthDate":"1986-05-22","heightCm":160.0}"""
        }.andExpect { status { isOk() } }
        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$day","weightKg":50.0}"""
        }.andExpect { status { isOk() } }
        goals.insert(Goal(null, day.minusMonths(2), 50.0, 45.0, 1.5, active = true))

        mockMvc.get("/api/summary") {
            param("date", "$day")
        }.andExpect {
            status { isOk() }
            jsonPath("$.deficitSuspended") { value(true) }
            // No deficit is applied at all, so the Budget is the Maintenance the
            // engine derived — never a floor, and never last week's figure.
            jsonPath("$.calorieBudget") { value(closeTo(1594.6, 1e-6)) }
        }
    }

    @Test
    fun `the summary stays up when a window's log is contradicted by its scale`() {
        // The second outage (issue #332), reached with no Goal at all, so ADR 0030's
        // suspension cannot be what saves it. Ten logged days at 800 kcal against a
        // trend the scale says rose 2 kg: the balance is -300 kcal, Maintenance's own
        // `require(kcal > 0)` refused it, and this read 400'd every day the window
        // held. The review is now HELD, and the endpoint answers.
        val day = LocalDate.of(2026, 6, 10)
        savedProfile()
        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"${day.minusDays(14)}","weightKg":86.0}"""
        }.andExpect { status { isOk() } }
        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$day","weightKg":106.0}"""
        }.andExpect { status { isOk() } }
        for (offset in 14 downTo 5) {
            mockMvc.post("/api/entries/estimated") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"date":"${day.minusDays(offset.toLong())}",
                              "label":"Breakfast","calories":800.0,"protein":40.0}"""
            }.andExpect { status { isCreated() } }
        }

        mockMvc.get("/api/summary") {
            param("date", "$day")
        }.andExpect {
            status { isOk() }
            // Cold start, so there is no earlier Maintenance to hold and the seed is
            // what stands: the trend is 88.0 kg, whose BMR is 1810, x 1.4 = 2534. In
            // Maintenance Mode the Budget is that figure — never the -300 the window
            // computed, and never a floor.
            jsonPath("$.calorieBudget") { value(closeTo(2534.0, 1e-6)) }
        }
    }

    @Test
    fun `the summary names why a held Budget did not move`() {
        // The Budget the User is being held to is on `/`, so that is where the remedy
        // belongs — a badge on /review is history, and history does not tell anybody
        // what to do today (ADR 0031).
        val day = LocalDate.of(2026, 6, 10)
        savedProfile()
        seedReview(day.minusDays(8), budgetKcal = 1850.0, floorG = 172.0)
        // An anchor at the window's open and a reading inside it, so the weighing
        // floor is cleared and nothing logged is what held this review. Both are
        // needed: the anchor alone measures the days *before* the window.
        for ((offset, kg) in listOf(16L to 86.4, 10L to 86.0)) {
            mockMvc.post("/api/weight") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"date":"${day.minusDays(offset)}","weightKg":$kg}"""
            }.andExpect { status { isOk() } }
        }

        mockMvc.get("/api/summary") {
            param("date", "$day")
        }.andExpect {
            status { isOk() }
            jsonPath("$.heldReason") { value("THIN_LOG") }
        }
    }

    @Test
    fun `a Goal whose deficit fits reports no Suspended Deficit`() {
        // 86 kg on the seeded body maintains well above the 550 kcal a 0.5 kg/week
        // Goal asks for, so the deficit is applied and the question is answered no
        // rather than not arising.
        val day = LocalDate.of(2026, 6, 10)
        completeSetup(day)

        mockMvc.get("/api/summary") {
            param("date", "$day")
        }.andExpect {
            status { isOk() }
            jsonPath("$.deficitSuspended") { value(false) }
        }
    }

    @Test
    fun `Maintenance Mode has no Suspended Deficit to report`() {
        // No Goal, so no deficit and no rate for Maintenance to outrun. The field is
        // an explicit null rather than a false (ADR 0023): the question does not
        // arise, which is not the same as arising and being answered no.
        val day = LocalDate.of(2026, 6, 10)
        maintenanceSetup(day)

        mockMvc.get("/api/summary") {
            param("date", "$day")
        }.andExpect {
            status { isOk() }
            jsonPath("$.deficitSuspended") { value(null) }
        }
    }

    @Test
    fun `loading the summary the same day does not re-run the review`() {
        val setupDay = LocalDate.now()
        completeSetup(setupDay)

        mockMvc.get("/api/summary") {
            param("date", "$setupDay")
        }.andExpect { status { isOk() } }

        // No second review: the first one, dated the setup day, is still the latest.
        mockMvc.get("/api/weekly-review/history").andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
        }
    }
}
