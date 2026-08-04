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

    /**
     * POST [body] to [path] as whoever [token] names, and return the created row's id.
     * The three creating helpers differ only in path and body.
     */
    private fun postForId(token: String, path: String, body: String): Long {
        val json = mockMvc.post(path) {
            header(ACCESS_ASSERTION_HEADER, token)
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
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

    private fun completeProfile(token: String) {
        mockMvc.put("/api/profile") {
            header(ACCESS_ASSERTION_HEADER, token)
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0}"""
        }.andExpect { status { isOk() } }
    }

    private fun weighIn(token: String, on: LocalDate) {
        mockMvc.post("/api/weight") {
            header(ACCESS_ASSERTION_HEADER, token)
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$on","weightKg":86.0}"""
        }.andExpect { status { isOk() } }
    }
}
