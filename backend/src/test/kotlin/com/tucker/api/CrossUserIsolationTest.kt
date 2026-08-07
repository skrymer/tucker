package com.tucker.api

import com.fasterxml.jackson.databind.ObjectMapper
import com.tucker.provider.OpenFoodFactsProvider
import com.tucker.security.ACCESS_ASSERTION_HEADER
import com.tucker.security.AccessTokens
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * The guarantee ADR 0021 makes, asserted where it is promised: at the **endpoint**
 * seam. "Bob cannot see Alice's catalog" is the rule; "the repository added a
 * `WHERE user_id` clause" is only the mechanism, and a test written against the
 * mechanism would still pass if a controller reached past it (ADR 0013).
 *
 * Both identities arrive the way a real one does — a signed assertion the backend
 * verifies through its own decoder — so nothing here is trusted into place.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class CrossUserIsolationTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper

    /**
     * Stubbed with no capabilities, so no Provider takes part in a scan and a barcode
     * that misses the caller's catalog is a plain miss. This suite is about which rows
     * a User can reach, and a real Provider call would put the internet in the middle
     * of that question.
     */
    @MockitoBean lateinit var openFoodFacts: OpenFoodFactsProvider

    @BeforeEach
    fun noProvidersAnswer() {
        whenever(openFoodFacts.capabilities).thenReturn(emptySet())
    }

    private val alice = AccessTokens.mint(email = "alice@tucker.invalid")
    private val bob = AccessTokens.mint(email = "bob@tucker.invalid")

    private val day = LocalDate.of(2026, 6, 18)

    /** Comfortably before [day], for the review an engine fallback would reach back to. */
    private val earlier = day.minusDays(10)

    // Two very different bodies, so a mixed trend or a borrowed Maintenance lands on
    // a figure neither of them could have produced. Named because every fixture
    // weight below has an assertion that has to keep agreeing with it.
    private val aliceKg = 71.0
    private val bobKg = 94.5

    /** The window the adaptive correction looks back over (WeeklyReviewService). */
    private val adaptiveWindowDays = 14

    /** Comfortably past the MIN_LOGGED_DAYS coverage floor that window demands. */
    private val daysAliceLogged = 12

    @Test
    fun `a User's catalog shows only their own Foods`() {
        createFood(alice, "Alice's almonds")
        createFood(bob, "Bob's skyr")

        mockMvc.get("/api/foods") { header(ACCESS_ASSERTION_HEADER, bob) }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].name") { value("Bob's skyr") }
        }
    }

    @Test
    fun `fetching another User's Food by id is not found rather than forbidden`() {
        val almonds = createFood(alice, "Alice's almonds")

        // 404, never 403: a 403 would confirm the row exists, which is the whole
        // thing an id probe is trying to learn (ADR 0021).
        mockMvc.get("/api/foods/$almonds") { header(ACCESS_ASSERTION_HEADER, bob) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `a User's day shows only their own Entries and totals only their intake`() {
        logEstimated(alice, calories = 700.0, protein = 40.0, label = "Alice's lunch out")
        logEstimated(bob, calories = 250.0, protein = 12.0, label = "Bob's porridge")

        mockMvc.get("/api/summary") {
            header(ACCESS_ASSERTION_HEADER, bob)
            param("date", "$day")
        }.andExpect {
            status { isOk() }
            jsonPath("$.entries.length()") { value(1) }
            jsonPath("$.entries[0].label") { value("Bob's porridge") }
            // The totals are the point: a leak here is silent, because a wrong number
            // still looks like a number.
            jsonPath("$.caloriesConsumed") { value(250.0) }
            jsonPath("$.proteinConsumed") { value(12.0) }
        }
    }

    @Test
    fun `a User's Entries for a day are only their own`() {
        logEstimated(alice, calories = 700.0, protein = 40.0, label = "Alice's lunch out")
        logEstimated(bob, calories = 250.0, protein = 12.0, label = "Bob's porridge")

        mockMvc.get("/api/entries") {
            header(ACCESS_ASSERTION_HEADER, bob)
            param("date", "$day")
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].label") { value("Bob's porridge") }
        }
    }

    @Test
    fun `a barcode another User has saved does not resolve from this User's catalog`() {
        createFood(alice, "Alice's skyr", barcode = "5701234567890")

        // The catalog-first step of a scan (ADR 0006) reads the *caller's* catalog.
        // Resolving Alice's row here would hand Bob her Food's name and macros in a
        // 200 body, from nothing but a barcode he scanned in a shop.
        mockMvc.get("/api/foods/barcode/5701234567890") { header(ACCESS_ASSERTION_HEADER, bob) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `deleting another User's Entry leaves it where it was`() {
        val lunch = logEstimated(alice, calories = 700.0, protein = 40.0, label = "Alice's lunch out")

        // 204, not 404 — the same answer an id nobody owns gets, because deleting is
        // idempotent and a status that singled this case out would confirm the row.
        mockMvc.delete("/api/entries/$lunch") { header(ACCESS_ASSERTION_HEADER, bob) }
            .andExpect { status { isNoContent() } }

        // The answer says nothing happened, and nothing did.
        mockMvc.get("/api/summary") {
            header(ACCESS_ASSERTION_HEADER, alice)
            param("date", "$day")
        }.andExpect {
            jsonPath("$.entries.length()") { value(1) }
            jsonPath("$.entries[0].label") { value("Alice's lunch out") }
        }
    }

    @Test
    fun `deleting another User's Food leaves it in their catalog`() {
        val almonds = createFood(alice, "Alice's almonds")

        // 204 rather than 404, deliberately: an absent Food already deletes as 204
        // (the rule is idempotent), and a foreign one has to answer identically or
        // the status code becomes a way to ask whether a row exists.
        mockMvc.delete("/api/foods/$almonds") { header(ACCESS_ASSERTION_HEADER, bob) }
            .andExpect { status { isNoContent() } }

        mockMvc.get("/api/foods") { header(ACCESS_ASSERTION_HEADER, alice) }.andExpect {
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].name") { value("Alice's almonds") }
        }
    }

    @Test
    fun `two Users can each hold a Food with the same barcode`() {
        createFood(alice, "Alice's skyr", barcode = "5701234567890")
        createFood(bob, "Bob's skyr", barcode = "5701234567890")

        // Same product, two rows, and each scans to its owner's own — the duplication
        // ADR 0021 accepts as the price of nothing being shared.
        mockMvc.get("/api/foods/barcode/5701234567890") { header(ACCESS_ASSERTION_HEADER, bob) }
            .andExpect {
                status { isOk() }
                jsonPath("$.outcome") { value("EXISTING") }
                jsonPath("$.food.name") { value("Bob's skyr") }
            }
    }

    @Test
    fun `adding another User's Food as a Recipe ingredient is not found`() {
        val almonds = createFood(alice, "Alice's almonds")

        mockMvc.post("/api/recipes") {
            header(ACCESS_ASSERTION_HEADER, bob)
            contentType = MediaType.APPLICATION_JSON
            content = """
                {"name":"Bob's granola","cookedWeightG":500.0,
                 "ingredients":[{"foodId":$almonds,"grams":200.0}]}
            """.trimIndent()
        }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `logging a Weighed Entry against another User's Food is not found`() {
        val almonds = createFood(alice, "Alice's almonds")

        mockMvc.post("/api/entries/weighed") {
            header(ACCESS_ASSERTION_HEADER, bob)
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$day","foodId":$almonds,"grams":30.0}"""
        }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `previewing a Weighed Entry against another User's Food is not found`() {
        val almonds = createFood(alice, "Alice's almonds")

        // A Budget Projection writes nothing, but it still has to resolve a foodId,
        // and answering with Alice's calories would leak her Food's macros without
        // ever creating a row.
        mockMvc.post("/api/entries/weighed/preview") {
            header(ACCESS_ASSERTION_HEADER, bob)
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$day","foodId":$almonds,"grams":30.0}"""
        }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `a Budget Projection counts only the caller's day`() {
        logEstimated(alice, calories = 700.0, protein = 40.0, label = "Alice's lunch out")
        logEstimated(bob, calories = 250.0, protein = 12.0, label = "Bob's porridge")

        mockMvc.post("/api/entries/estimated/preview") {
            header(ACCESS_ASSERTION_HEADER, bob)
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$day","label":"a biscuit","calories":100.0,"protein":null}"""
        }.andExpect {
            status { isOk() }
            // Bob's 250 plus the 100 he is weighing up — not Alice's 700 as well.
            jsonPath("$.projectedCaloriesConsumed") { value(350.0) }
        }
    }

    @Test
    fun `fetching another User's Recipe by id is not found`() {
        val granola = createRecipe(alice, "Alice's granola", createFood(alice, "Alice's oats"))

        mockMvc.get("/api/recipes/$granola") { header(ACCESS_ASSERTION_HEADER, bob) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `editing another User's Recipe is not found and leaves it as it was`() {
        val granola = createRecipe(alice, "Alice's granola", createFood(alice, "Alice's oats"))
        // Bob's *own* Food as the ingredient, deliberately. Naming Alice's here would
        // 404 on the ingredient instead, and the test would go on passing with the
        // recipe-ownership check deleted — green for the wrong reason, on a guard.
        val rice = createFood(bob, "Bob's rice")

        mockMvc.put("/api/recipes/$granola") {
            header(ACCESS_ASSERTION_HEADER, bob)
            contentType = MediaType.APPLICATION_JSON
            content = """
                {"name":"Bob's rename","cookedWeightG":100.0,
                 "ingredients":[{"foodId":$rice,"grams":50.0}]}
            """.trimIndent()
        }.andExpect { status { isNotFound() } }

        // Refused, and unchanged — a write that 404s must not have landed on the way
        // to saying so.
        mockMvc.get("/api/recipes/$granola") { header(ACCESS_ASSERTION_HEADER, alice) }.andExpect {
            status { isOk() }
            jsonPath("$.name") { value("Alice's granola") }
            jsonPath("$.cookedWeightG") { value(500.0) }
            jsonPath("$.ingredients[0].grams") { value(600.0) }
        }
    }

    @Test
    fun `another User's logged days do not drive this User's adaptive maintenance`() {
        // The server resolves its own today from Clock.systemUTC(), so this must too:
        // a zone ahead of UTC would otherwise post a future-dated weigh-in and 400.
        val today = LocalDate.now(ZoneOffset.UTC)
        // Bob has weighed in right across the adaptive window, so a trend anchor
        // exists and the only thing standing between him and an adaptive review is
        // his own logging coverage — of which he has none.
        completeProfile(bob)
        (0..adaptiveWindowDays).forEach { back -> weighIn(bob, today.minusDays(back.toLong())) }

        // Alice, meanwhile, has logged most of that window — comfortably past the
        // coverage floor the adaptive correction demands.
        (1..daysAliceLogged).forEach { back ->
            logEstimated(
                alice, calories = 2000.0, protein = 100.0,
                label = "Alice day $back", on = today.minusDays(back.toLong()),
            )
        }

        mockMvc.post("/api/weekly-review") { header(ACCESS_ASSERTION_HEADER, bob) }.andExpect {
            status { isOk() }
            // Seeded from the formula, because Bob has logged nothing. Adapting here
            // would set his Calorie Budget from Alice's eating — a leak that never
            // shows a wrong name, only a wrong number.
            jsonPath("$.maintenanceBasis") { value("FORMULA_SEED") }
        }
    }

    /**
     * The positive control for the test above, and the reason it cannot pass
     * vacuously. FORMULA_SEED is also what a *broken setup* yields — one weigh-in
     * short of the window and there is no trend anchor, so the adaptive branch is
     * skipped for a reason that has nothing to do with ownership, and the isolation
     * assertion would go green with scoping entirely removed. This pins the same
     * fixture to ADAPTIVE by moving only whose Entries they are.
     */
    @Test
    fun `a User's own logged days do drive their adaptive maintenance`() {
        val today = LocalDate.now(ZoneOffset.UTC)
        completeProfile(bob)
        (0..adaptiveWindowDays).forEach { back -> weighIn(bob, today.minusDays(back.toLong())) }

        (1..daysAliceLogged).forEach { back ->
            logEstimated(
                bob, calories = 2000.0, protein = 100.0,
                label = "Bob day $back", on = today.minusDays(back.toLong()),
            )
        }

        mockMvc.post("/api/weekly-review") { header(ACCESS_ASSERTION_HEADER, bob) }.andExpect {
            status { isOk() }
            jsonPath("$.maintenanceBasis") { value("ADAPTIVE") }
        }
    }

    @Test
    fun `two Users can each record a weight for the same day`() {
        weighIn(alice, day, weightKg = aliceKg)
        weighIn(bob, day, weightKg = bobKg)

        // One reading each, each their own. Before the day was owned this was not a
        // constraint violation — it was worse: Bob's save found Alice's row for the
        // date and updated it, so her scale reading silently became his.
        mockMvc.get("/api/weight") { header(ACCESS_ASSERTION_HEADER, alice) }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].weightKg") { value(aliceKg) }
        }
        mockMvc.get("/api/weight") { header(ACCESS_ASSERTION_HEADER, bob) }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].weightKg") { value(bobKg) }
        }
    }

    @Test
    fun `a User's latest reading is their own, not the most recent one on the scale`() {
        weighIn(bob, day.minusDays(1), weightKg = bobKg)
        weighIn(alice, day, weightKg = aliceKg)

        // Alice weighed in more recently, so an unscoped "latest" hands Bob her
        // weight — under his own name, on his own screen.
        mockMvc.get("/api/weight/latest") { header(ACCESS_ASSERTION_HEADER, bob) }.andExpect {
            status { isOk() }
            jsonPath("$.weightKg") { value(bobKg) }
            jsonPath("$.measuredOn") { value("${day.minusDays(1)}") }
        }
    }

    @Test
    fun `deleting another User's weight reading leaves it on their chart`() {
        val aliceMonday = weighIn(alice, day, weightKg = aliceKg)

        // 204 rather than 404, on the same reasoning as a Food or an Entry: this
        // endpoint already answers 204 for an id nobody owns, so a foreign one must
        // answer identically or the status becomes a way to ask whether a row exists.
        mockMvc.delete("/api/weight/$aliceMonday") { header(ACCESS_ASSERTION_HEADER, bob) }
            .andExpect { status { isNoContent() } }

        mockMvc.get("/api/weight") { header(ACCESS_ASSERTION_HEADER, alice) }.andExpect {
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].weightKg") { value(aliceKg) }
        }
    }

    @Test
    fun `a User's Trend Weight is smoothed over their own readings alone`() {
        // Alice weighs a great deal less than Bob and steps on the scale every day, so
        // an EWMA over the pair of them lands nowhere near either person's body.
        (0..6).forEach { back -> weighIn(alice, day.minusDays(back.toLong()), weightKg = aliceKg) }
        weighIn(bob, day, weightKg = bobKg)

        // One reading, so Bob's trend is exactly that reading — anything else is
        // Alice's weight leaking into the number his Goal and Budget are built on.
        mockMvc.get("/api/weight/trend") { header(ACCESS_ASSERTION_HEADER, bob) }.andExpect {
            status { isOk() }
            jsonPath("$.trendKg") { value(bobKg) }
            jsonPath("$.asOf") { value("$day") }
        }
    }

    @Test
    fun `two Users can each hold an active Goal at the same time`() {
        completeSetup(alice, aliceKg)
        setGoal(alice, targetWeightKg = 68.0)

        completeSetup(bob, bobKg)
        setGoal(bob, targetWeightKg = 88.0)

        // "At most one active Goal" is a rule about a person, not about the database.
        // Held globally, Bob's new Goal deactivates Alice's on its way in — and she
        // finds herself in Maintenance Mode having decided nothing.
        mockMvc.get("/api/goal") { header(ACCESS_ASSERTION_HEADER, alice) }.andExpect {
            status { isOk() }
            jsonPath("$.active") { value(true) }
            jsonPath("$.targetWeightKg") { value(68.0) }
        }
        mockMvc.get("/api/goal") { header(ACCESS_ASSERTION_HEADER, bob) }.andExpect {
            status { isOk() }
            jsonPath("$.active") { value(true) }
            jsonPath("$.targetWeightKg") { value(88.0) }
        }
    }

    @Test
    fun `a User with no Goal of their own is in Maintenance Mode, whoever else has one`() {
        completeSetup(alice, aliceKg)
        setGoal(alice, targetWeightKg = 68.0)

        weighIn(bob, day, weightKg = bobKg)

        // Not "403, that Goal is Alice's" — as far as Bob's Tucker is concerned there
        // is no Goal, which is Maintenance Mode (ADR 0008) and exactly what he sees.
        mockMvc.get("/api/goal") { header(ACCESS_ASSERTION_HEADER, bob) }
            .andExpect { status { isNotFound() } }
        mockMvc.get("/api/goal/progress") { header(ACCESS_ASSERTION_HEADER, bob) }
            .andExpect { status { isNotFound() } }
        mockMvc.get("/api/goals") { header(ACCESS_ASSERTION_HEADER, bob) }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(0) }
        }

        // And Alice still has hers, so the emptiness above is ownership and not an
        // empty database.
        mockMvc.get("/api/goals") { header(ACCESS_ASSERTION_HEADER, alice) }.andExpect {
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].targetWeightKg") { value(68.0) }
        }
    }

    @Test
    fun `switching to Maintenance Mode leaves another User's Goal alone`() {
        completeSetup(alice, aliceKg)
        setGoal(alice, targetWeightKg = 68.0)

        completeSetup(bob, bobKg)
        setGoal(bob, targetWeightKg = 88.0)

        mockMvc.delete("/api/goal") { header(ACCESS_ASSERTION_HEADER, bob) }
            .andExpect { status { isNoContent() } }

        // Bob decided to maintain. Alice did not, and a sweep that clears "every
        // active Goal" would have decided it for her — silently, and irreversibly as
        // far as the banner that would have offered her the choice is concerned.
        mockMvc.get("/api/goal") { header(ACCESS_ASSERTION_HEADER, alice) }.andExpect {
            status { isOk() }
            jsonPath("$.active") { value(true) }
            jsonPath("$.targetWeightKg") { value(68.0) }
        }
        mockMvc.get("/api/goal") { header(ACCESS_ASSERTION_HEADER, bob) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `two Users can each hold a Weekly Review dated the same day`() {
        completeSetup(alice, aliceKg)
        completeSetup(bob, bobKg)

        mockMvc.post("/api/weekly-review") { header(ACCESS_ASSERTION_HEADER, alice) }
            .andExpect { status { isOk() } }

        // A review is idempotent by date, so an unscoped lookup doesn't collide — it
        // hands Bob Alice's review and calls it his. Her trend weight, her
        // Maintenance, her Calorie Budget, on his dashboard.
        mockMvc.post("/api/weekly-review") { header(ACCESS_ASSERTION_HEADER, bob) }.andExpect {
            status { isOk() }
            jsonPath("$.trendWeightKg") { value(bobKg) }
        }

        mockMvc.get("/api/weekly-review") { header(ACCESS_ASSERTION_HEADER, alice) }.andExpect {
            status { isOk() }
            jsonPath("$.trendWeightKg") { value(aliceKg) }
        }
    }

    @Test
    fun `starting a Goal recomputes only the review of whoever started it`() {
        completeSetup(alice, aliceKg)
        mockMvc.post("/api/weekly-review") { header(ACCESS_ASSERTION_HEADER, alice) }
            .andExpect { status { isOk() } }

        completeSetup(bob, bobKg)
        // A Goal change is one of the few moments the Budget may move mid-week
        // (ADR 0008), so it overwrites today's review — by deleting it first. Held
        // globally, that delete takes Alice's review with it, and hers is not
        // recreated: she opens Tucker to no Budget at all, mid-week, with no
        // decision of her own behind it.
        setGoal(bob, targetWeightKg = 88.0)

        mockMvc.get("/api/weekly-review") { header(ACCESS_ASSERTION_HEADER, alice) }.andExpect {
            status { isOk() }
            jsonPath("$.trendWeightKg") { value(aliceKg) }
        }
        mockMvc.get("/api/weekly-review") { header(ACCESS_ASSERTION_HEADER, bob) }.andExpect {
            status { isOk() }
            jsonPath("$.trendWeightKg") { value(bobKg) }
        }
    }

    @Test
    fun `opening Tucker mints a review for whoever opened it, and for nobody else`() {
        completeSetup(alice, aliceKg)
        openTucker(alice)

        completeSetup(bob, bobKg)

        // The lazy catch-up asks "is the latest review a week or more old?", and a
        // missing review is itself overdue. Asked globally, Bob's app-open finds
        // Alice's fresh review, concludes nothing is due, and leaves him with no
        // Budget at all — no error, no empty state, just a dashboard that never fills in.
        mockMvc.get("/api/summary") {
            header(ACCESS_ASSERTION_HEADER, bob)
            param("date", "$day")
        }.andExpect {
            status { isOk() }
            jsonPath("$.trendWeightKg") { value(bobKg) }
            jsonPath("$.calorieBudget") { exists() }
        }

        // And Alice's history is where she left it — one review, still hers.
        mockMvc.get("/api/weekly-review/history") { header(ACCESS_ASSERTION_HEADER, alice) }
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(1) }
                jsonPath("$[0].trendWeightKg") { value(aliceKg) }
            }
    }

    @Test
    fun `a User too thinly logged to adapt is not handed another User's Maintenance`() {
        // Alice has a review on the books, dated well before the one Bob is about to run.
        completeSetup(alice, aliceKg, on = earlier)
        openTucker(alice, on = earlier)

        // Bob has a trend anchor and no logged days at all, so the adaptive correction
        // cannot run and the engine falls back to holding the last review's
        // Maintenance. Asked globally, the last review is Alice's — and Bob's Calorie
        // Budget is then built on a 71 kg person's metabolism, under his own name,
        // with nothing on any screen to say so.
        completeSetup(bob, bobKg)

        mockMvc.post("/api/weekly-review") { header(ACCESS_ASSERTION_HEADER, bob) }.andExpect {
            status { isOk() }
            jsonPath("$.maintenanceBasis") { value("FORMULA_SEED") }
            jsonPath("$.trendWeightKg") { value(bobKg) }
        }
    }

    /**
     * The positive control for the test above. FORMULA_SEED is also what a fallback
     * that reaches *nobody's* review yields, so without this the isolation assertion
     * would go green against a `latestBefore` that had simply stopped working. This
     * runs the identical fixture with only the earlier review's owner changed, and
     * pins it to HELD — and to the very figure that was held.
     */
    @Test
    fun `a User too thinly logged to adapt does hold their own earlier Maintenance`() {
        completeSetup(bob, bobKg, on = earlier)
        openTucker(bob, on = earlier)

        val heldKcal = mockMvc.get("/api/weekly-review") { header(ACCESS_ASSERTION_HEADER, bob) }
            .andExpect { status { isOk() } }.andReturn().response.contentAsString
            .let { objectMapper.readTree(it).get("maintenanceKcal").asDouble() }

        weighIn(bob, day, weightKg = bobKg)

        mockMvc.post("/api/weekly-review") { header(ACCESS_ASSERTION_HEADER, bob) }.andExpect {
            status { isOk() }
            jsonPath("$.maintenanceBasis") { value("HELD") }
            jsonPath("$.maintenanceKcal") { value(heldKcal) }
        }
    }

    /**
     * POST [body] to [path] as whoever [token] names, and return the stored row's id.
     * Every creating helper below differs only in path, body, and the status the
     * endpoint answers with — recording a reading *replaces* the day's earlier one,
     * so it answers 200.
     */
    private fun postForId(token: String, path: String, body: String, created: Boolean = true): Long {
        val json = mockMvc.post(path) {
            header(ACCESS_ASSERTION_HEADER, token)
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect { status { if (created) isCreated() else isOk() } }
            .andReturn().response.contentAsString
        return objectMapper.readTree(json).get("id").asLong()
    }

    /** Create a Food owned by whoever [token] names, and return its id. */
    private fun createFood(token: String, name: String, barcode: String? = null): Long {
        return postForId(
            token, "/api/foods",
            """
                {"name":"$name",${barcode?.let { """"barcode":"$it",""" } ?: ""}
                 "proteinPer100g":10.0,"carbsPer100g":4.0,"fatPer100g":0.2}
            """.trimIndent(),
        )
    }

    /** Create a single-ingredient Recipe owned by whoever [token] names, returning its id. */
    private fun createRecipe(token: String, name: String, ingredientId: Long): Long {
        return postForId(
            token, "/api/recipes",
            """
                {"name":"$name","cookedWeightG":500.0,
                 "ingredients":[{"foodId":$ingredientId,"grams":600.0}]}
            """.trimIndent(),
        )
    }

    /** Log an estimated Entry owned by whoever [token] names, and return its id. */
    private fun logEstimated(
        token: String,
        calories: Double,
        protein: Double,
        label: String,
        on: LocalDate = day,
    ): Long {
        return postForId(
            token, "/api/entries/estimated",
            """{"date":"$on","label":"$label","calories":$calories,"protein":$protein}""",
        )
    }

    /** Set the active Goal of whoever [token] names, and return its id. */
    private fun setGoal(token: String, targetWeightKg: Double, rateKgPerWeek: Double = 0.5): Long =
        postForId(
            token, "/api/goal",
            """{"startedOn":"$day","targetWeightKg":$targetWeightKg,"rateKgPerWeek":$rateKgPerWeek}""",
        )

    /** Read the dashboard as whoever [token] names — the app-open the catch-up rides on. */
    private fun openTucker(token: String, on: LocalDate = day) {
        mockMvc.get("/api/summary") {
            header(ACCESS_ASSERTION_HEADER, token)
            param("date", "$on")
        }.andExpect { status { isOk() } }
    }

    private fun completeProfile(token: String) {
        mockMvc.put("/api/profile") {
            header(ACCESS_ASSERTION_HEADER, token)
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0}"""
        }.andExpect { status { isOk() } }
    }

    /** Record a reading owned by whoever [token] names, and return its id. */
    private fun weighIn(token: String, on: LocalDate, weightKg: Double = 86.0): Long =
        postForId(
            token, "/api/weight",
            """{"date":"$on","weightKg":$weightKg}""",
            created = false,
        )

    /**
     * Everything a User needs before the engine will produce anything for them: a
     * Profile to seed Maintenance from, and a reading to anchor their trend on.
     */
    private fun completeSetup(token: String, weightKg: Double, on: LocalDate = day) {
        completeProfile(token)
        weighIn(token, on, weightKg)
    }
}
