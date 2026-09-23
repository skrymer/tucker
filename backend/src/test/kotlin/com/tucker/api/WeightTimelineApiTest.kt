package com.tucker.api

import com.tucker.domain.Goal
import com.tucker.domain.IntakeTargets
import com.tucker.domain.Maintenance
import com.tucker.domain.WeeklyReview
import com.tucker.persistence.GoalRepository
import com.tucker.persistence.ReminderStateRepository
import com.tucker.persistence.WeeklyReviewRepository
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
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * `GET /api/weight-timeline` — a Weight Timeline (ADR 0029) over a window the
 * client supplies (ADR 0014), both bounds inclusive.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithTuckerUser
class WeightTimelineApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var goals: GoalRepository
    @Autowired lateinit var reminderState: ReminderStateRepository
    @Autowired lateinit var reviews: WeeklyReviewRepository

    // Must stay in the past: none of the seeding helpers sends a `clientToday`, so
    // the server resolves its own date, and `weighIn` is refused first — a reading
    // may not be in the future. Only ever recedes, so it cannot start failing.
    private val day = LocalDate.of(2026, 9, 6)
    private val from = day.minusDays(27)

    private fun weighIn(on: LocalDate, kg: Double = 80.0) {
        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$on","weightKg":$kg}"""
        }.andExpect { status { isOk() } }
    }

    /**
     * Readings on the fifteen days ending on [day], bar one skipped in the middle.
     * The last is a kilo lighter than the rest, so a trend figure on the wire can be
     * told from a reading and from every other day's trend.
     */
    private fun aFortnightOnTheScale() {
        (1L..14L).map { day.minusDays(it) }
            .filter { it != day.minusDays(7) }
            .forEach { weighIn(it) }
        weighIn(day, kg = 79.0)
    }

    /** A review dated [on] whose week was to be eaten at [budgetKcal]. */
    private fun reviewed(on: LocalDate, budgetKcal: Double) {
        reviews.insert(
            WeeklyReview(
                id = null,
                reviewedOn = on,
                trendWeightKg = 80.0,
                intakeTargets = IntakeTargets(
                    maintenance = Maintenance(budgetKcal + 500, Maintenance.Basis.FORMULA_SEED),
                    calorieBudgetKcal = budgetKcal,
                    proteinFloorG = 160.0,
                ),
            ),
        )
    }

    private fun ate(on: LocalDate, calories: Double) {
        mockMvc.post("/api/entries/estimated") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$on","label":"dinner","calories":$calories,"protein":40.0}"""
        }.andExpect { status { isCreated() } }
    }

    /** Setup completed as a weight-only User — the whole of what F12 asks Tucker to respect. */
    private fun tracksWeightOnly() = setUp(tracksCalories = false)

    /** Setup completed with Calorie Tracking left on, which is the default. */
    private fun tracksCalories() = setUp(tracksCalories = true)

    private fun setUp(tracksCalories: Boolean) {
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """
                {"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0,"tracksCalories":$tracksCalories}
            """.trimIndent()
        }.andExpect { status { isOk() } }
    }

    /**
     * An active Goal running from [startedOn] at [startWeightKg] — written through
     * the repository, not `POST /api/goal`. The API takes a past [startedOn] happily
     * enough; what it will not do is anchor on a past weight (ADR 0016), so a Goal
     * created there runs from a fortnight ago at *today's* trend. Backdating is a
     * fixture device, to get a drawn run of plan out of one window, and it needs
     * both ends to agree.
     */
    private fun setGoal(
        startedOn: LocalDate,
        startWeightKg: Double,
        targetWeightKg: Double,
        rateKgPerWeek: Double,
    ) {
        goals.insert(
            Goal(
                id = null,
                startedOn = startedOn,
                startWeightKg = startWeightKg,
                targetWeightKg = targetWeightKg,
                rateKgPerWeek = rateKgPerWeek,
                active = true,
            ),
        )
    }

    private fun timeline(from: LocalDate = this.from, to: LocalDate = day) =
        mockMvc.get("/api/weight-timeline") {
            param("from", "$from")
            param("to", "$to")
        }

    @Test
    fun `every day of the window carries its reading, or an explicit null when there was none`() {
        aFortnightOnTheScale()

        timeline().andExpect {
            status { isOk() }
            jsonPath("$.from") { value("${day.minusDays(14)}") }
            jsonPath("$.to") { value("$day") }
            jsonPath("$.days.length()") { value(15) }
            jsonPath("$.days[0].date") { value("${day.minusDays(14)}") }
            jsonPath("$.days[0].weightKg") { value(80.0) }
            jsonPath("$.days[7].date") { value("${day.minusDays(7)}") }
            jsonPath("$.days[7].weightKg") { value(null) }
            jsonPath("$.days[7].trendKg") { value(80.0) }
            jsonPath("$.days[14].date") { value("$day") }
            jsonPath("$.days[14].weightKg") { value(79.0) }
            // The trend moves a tenth of the way toward the new reading, so the last
            // day's is neither the reading nor the 80.0 every day before it carries.
            jsonPath("$.days[14].trendKg") { value(79.9) }
        }
    }

    @Test
    fun `a day carries what was logged on it and the Budget in force that day`() {
        aFortnightOnTheScale()
        reviewed(day.minusDays(14), budgetKcal = 1800.0)
        reviewed(day.minusDays(3), budgetKcal = 1750.0)
        ate(day.minusDays(14), calories = 2000.0)
        ate(day, calories = 1600.0)

        timeline().andExpect {
            status { isOk() }
            jsonPath("$.evidence.kind") { value("INTAKE") }
            jsonPath("$.evidence.loggedDays") { value(2) }
            jsonPath("$.days[0].caloriesKcal") { value(2000.0) }
            jsonPath("$.days[0].calorieBudgetKcal") { value(1800.0) }
            // Absent, never zero: a floor-height bar would read as a day of eating
            // nothing, which is the reading ADR 0018 exists to refuse.
            jsonPath("$.days[1].caloriesKcal") { value(null) }
            // The Budget spans it — it was set by a review and held all week.
            jsonPath("$.days[1].calorieBudgetKcal") { value(1800.0) }
            jsonPath("$.days[14].caloriesKcal") { value(1600.0) }
            jsonPath("$.days[14].calorieBudgetKcal") { value(1750.0) }
            // The verdict is stated, not left to the client to derive (ADR 0002).
            jsonPath("$.days[0].overBudget") { value(true) }
            jsonPath("$.days[14].overBudget") { value(false) }
            jsonPath("$.days[1].overBudget") { value(null) }
        }
    }

    @Test
    fun `with Calorie Tracking off the intake half never reaches the wire`() {
        // Absent server-side, so the client has nothing to hide: weight is the
        // premise and intake the addition, and only the addition goes.
        tracksWeightOnly()
        aFortnightOnTheScale()
        reviewed(day.minusDays(3), budgetKcal = 1750.0)
        ate(day, calories = 1600.0)

        timeline().andExpect {
            status { isOk() }
            jsonPath("$.evidence") { value(null) }
            jsonPath("$.days[14].caloriesKcal") { value(null) }
            jsonPath("$.days[14].calorieBudgetKcal") { value(null) }
            jsonPath("$.days[14].overBudget") { value(null) }
        }
    }

    @Test
    fun `with Calorie Tracking off a day carries where the Goal's plan puts it`() {
        tracksWeightOnly()
        aFortnightOnTheScale()
        setGoal(
            startedOn = day.minusDays(14),
            startWeightKg = 80.0,
            targetWeightKg = 76.0,
            rateKgPerWeek = 0.5,
        )

        timeline().andExpect {
            status { isOk() }
            // The plan runs from the Goal's own start weight at its own rate — half a
            // kilo a week from 80.0 — whatever the trend has done since. Seeded
            // backdated through the repository: the app always starts a Goal today
            // (ADR 0016), and one window has to hold a run of plan to draw.
            jsonPath("$.days[0].trajectoryKg") { value(80.0) }
            jsonPath("$.days[7].trajectoryKg") { value(79.5) }
            jsonPath("$.days[14].trajectoryKg") { value(79.0) }
            // A plan is not a log, and a logged-day count is how a client knows the
            // intake half is what it is looking at — a count of none would draw a
            // tracking window with nothing in it.
            jsonPath("$.evidence.kind") { value("PLAN") }
            jsonPath("$.evidence.loggedDays") { value(null) }
        }
    }

    @Test
    fun `with Calorie Tracking on there is no plan, the calorie half answering that question`() {
        // The absence is the decision (ADR 0029): both settings ask "am I on track",
        // and with tracking on the bars under the Budget line answer it. This is what
        // fails if the two branches are ever swapped.
        tracksCalories()
        aFortnightOnTheScale()
        setGoal(
            startedOn = day.minusDays(14),
            startWeightKg = 80.0,
            targetWeightKg = 76.0,
            rateKgPerWeek = 0.5,
        )

        timeline().andExpect {
            status { isOk() }
            jsonPath("$.days[0].trajectoryKg") { value(null) }
            jsonPath("$.days[14].trajectoryKg") { value(null) }
            // And the half that did answer it is there, so what is absent is the plan
            // rather than the whole of what the timeline draws beside the weight.
            jsonPath("$.evidence.kind") { value("INTAKE") }
            jsonPath("$.evidence.loggedDays") { value(0) }
            jsonPath("$.evidence.planStartsOn") { value(null) }
        }
    }

    @Test
    fun `a window ending before the Goal started is told apart from Maintenance Mode`() {
        // Two devices, no broken clock: a phone in Brisbane at 08:00 Tuesday sends
        // `clientToday` a day ahead of the server's UTC Monday, ADR 0014's tolerance
        // accepts it, and a desktop reading in UTC then asks for a window ending
        // today. Every `trajectoryKg` is null — which is byte-for-byte what
        // Maintenance Mode sends, no day carrying a plan either way.
        tracksWeightOnly()
        aFortnightOnTheScale()
        // The reading device's window closes on the server's own day, and the Goal
        // starts the day after it — the one-day gap ADR 0014's tolerance admits,
        // and the whole of what makes the two devices disagree. Both dates come
        // off the clock rather than off this class's fixed `day`, or the gap under
        // test would be however long ago that date is.
        val serverToday = LocalDate.now()
        val tomorrow = serverToday.plusDays(1)
        mockMvc.post("/api/goal") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"startedOn":"$tomorrow","clientToday":"$tomorrow",
                          "targetWeightKg":76.0,"rateKgPerWeek":0.5}"""
        }.andExpect { status { isCreated() } }

        timeline(from = serverToday.minusDays(27), to = serverToday).andExpect {
            status { isOk() }
            jsonPath("$.days[0].trajectoryKg") { value(null) }
            jsonPath("$.days[14].trajectoryKg") { value(null) }
            // So the response has to say a plan is what it draws, or the card renders
            // the Maintenance-Mode shape with nothing explaining why (ADR 0029).
            jsonPath("$.evidence.kind") { value("PLAN") }
            jsonPath("$.evidence.planStartsOn") { value("$tomorrow") }
        }
    }

    @Test
    fun `in Maintenance Mode there is no plan at all, only the weight`() {
        // A decision rather than an omission: Tucker defends no target weight
        // (ADR 0008), so with no active Goal there is nothing to plan against.
        tracksWeightOnly()
        aFortnightOnTheScale()

        timeline().andExpect {
            status { isOk() }
            jsonPath("$.days[0].trajectoryKg") { value(null) }
            jsonPath("$.days[14].trajectoryKg") { value(null) }
            jsonPath("$.days[14].trendKg") { value(79.9) }
            // Neither half named, which is what makes this state itself rather than
            // the default every plan that draws nothing falls into. The test above
            // sends the same days and says a plan starts tomorrow.
            jsonPath("$.evidence") { value(null) }
        }
    }

    @Test
    fun `a history under a fortnight of readings has no timeline to return`() {
        (0L..12L).forEach { weighIn(day.minusDays(it)) }

        timeline().andExpect { status { isNotFound() } }
    }

    @Test
    fun `a window of any width but 28 or 90 days is a bad request`() {
        aFortnightOnTheScale()

        timeline(from = day.minusDays(6)).andExpect { status { isBadRequest() } }
    }

    @Test
    fun `drawing a chart neither runs a due review nor counts as showing up`() {
        // Both are app-open bookkeeping, and only the Today screen and a Check perform
        // it (ADR 0010). Widening it here would change when the Weekly-Review Reminder
        // fires as a side effect of adding a chart, so the absence is asserted — and
        // the summary read below is what proves a review was there to be run.
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0}"""
        }.andExpect { status { isOk() } }
        aFortnightOnTheScale()

        timeline().andExpect { status { isOk() } }

        mockMvc.get("/api/weekly-review/history").andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(0) }
        }
        assertNull(reminderState.lastSeenOn())

        mockMvc.get("/api/summary") { param("date", "$day") }.andExpect { status { isOk() } }

        mockMvc.get("/api/weekly-review/history").andExpect {
            jsonPath("$.length()") { value(1) }
        }
        assertEquals(day, reminderState.lastSeenOn())
    }
}
