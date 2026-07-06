package com.tucker.persistence

import com.tucker.domain.EstimatedEntry
import com.tucker.domain.Food
import com.tucker.domain.FoodKind
import com.tucker.domain.Goal
import com.tucker.domain.Nutrition
import com.tucker.domain.Profile
import com.tucker.domain.Recipe
import com.tucker.domain.RecipeIngredient
import com.tucker.domain.Sex
import com.tucker.domain.WeighedEntry
import com.tucker.domain.WeightMeasurement
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Round-trips each repository against the real SQLite schema. Each test runs in a
 * transaction that is rolled back, so the test database stays clean.
 */
@SpringBootTest
@Transactional
class RepositoryRoundTripTest {

    @Autowired lateinit var foods: FoodRepository
    @Autowired lateinit var entries: EntryRepository
    @Autowired lateinit var weights: WeightMeasurementRepository
    @Autowired lateinit var goals: GoalRepository
    @Autowired lateinit var profiles: ProfileRepository
    @Autowired lateinit var recipes: RecipeRepository
    @Autowired lateinit var reminderState: ReminderStateRepository

    @Test
    fun `a Food round-trips`() {
        val saved = foods.insert(Food.plain(null, "Rolled oats", null, Nutrition(389.0, 16.9, 66.3, 6.9)))
        assertNotNull(saved.id)
        val loaded = foods.findById(saved.id!!)
        assertNotNull(loaded)
        assertEquals("Rolled oats", loaded.name)
        assertEquals(FoodKind.FOOD, loaded.kind)
        assertEquals(389.0, loaded.nutrition.caloriesPer100g, 0.01)
    }

    @Test
    fun `foods are listed alphabetically ignoring case`() {
        foods.insert(Food.plain(null, "banana", null, Nutrition(89.0, 1.1, 22.8, 0.3)))
        foods.insert(Food.plain(null, "Cherry", null, Nutrition(50.0, 1.0, 12.0, 0.3)))
        foods.insert(Food.plain(null, "apple", null, Nutrition(52.0, 0.3, 13.8, 0.2)))

        val listed = foods.findAll().map { it.name }
            .filter { it in setOf("banana", "Cherry", "apple") }

        // BINARY collation would sort "Cherry" first (uppercase before lowercase);
        // case-insensitive order interleaves the cases.
        assertEquals(listOf("apple", "banana", "Cherry"), listed)
    }

    @Test
    fun `a weighed Entry round-trips with computed calories`() {
        val banana = foods.insert(Food.plain(null, "Banana", null, Nutrition(89.0, 1.1, 22.8, 0.3)))
        val date = LocalDate.of(2026, 5, 22)
        entries.insert(WeighedEntry.log(date, banana, 120.0))

        val onDate = entries.findByDate(date)
        assertEquals(1, onDate.size)
        val logged = onDate.single() as WeighedEntry
        assertEquals(banana.id, logged.foodId)
        assertEquals(106.8, logged.calories, 0.05) // 89 kcal/100 g x 120 g
    }

    @Test
    fun `an estimated Entry round-trips and stays flagged`() {
        val date = LocalDate.of(2026, 5, 22)
        entries.insert(EstimatedEntry(null, date, "Restaurant pasta", 800.0, null))

        val logged = entries.findByDate(date).single() as EstimatedEntry
        assertEquals("Restaurant pasta", logged.label)
        assertTrue(logged.isEstimate)
    }

    @Test
    fun `a weight measurement is replaced when re-saved for the same day`() {
        val date = LocalDate.of(2026, 5, 22)
        weights.save(WeightMeasurement(null, date, 88.4))
        weights.save(WeightMeasurement(null, date, 88.1))

        assertEquals(88.1, weights.findOn(date)?.weightKg ?: 0.0, 0.01)
        assertEquals(1, weights.findAll().size)
    }

    @Test
    fun `the active Goal round-trips`() {
        goals.insert(Goal(null, LocalDate.of(2026, 5, 1), 90.0, 80.0, 0.5, active = true))
        val active = goals.findActive()
        assertNotNull(active)
        assertEquals(80.0, active.targetWeightKg, 0.01)
        assertEquals(0.5, active.rateKgPerWeek, 0.01)
    }

    @Test
    fun `the Profile round-trips`() {
        profiles.save(Profile(Sex.MALE, LocalDate.of(1985, 6, 15), 182.0))
        val loaded = profiles.get()
        assertNotNull(loaded)
        assertEquals(Sex.MALE, loaded.sex)
        assertEquals(182.0, loaded.heightCm, 0.01)
    }

    @Test
    fun `the last-seen day round-trips`() {
        assertNull(reminderState.lastSeenOn())
        reminderState.stampSeen(LocalDate.of(2026, 6, 10))
        assertEquals(LocalDate.of(2026, 6, 10), reminderState.lastSeenOn())
    }

    @Test
    fun `the last-reminder-sent instant round-trips`() {
        assertNull(reminderState.lastReminderSentAt())
        val at = Instant.parse("2026-06-10T09:00:00Z")
        reminderState.stampReminderSent(at)
        assertEquals(at, reminderState.lastReminderSentAt())
    }

    @Test
    fun `stamping an earlier last-seen day does not move it backwards`() {
        reminderState.stampSeen(LocalDate.of(2026, 6, 10))
        // A later summary read for an earlier day (e.g. an app left open across
        // midnight refreshing yesterday) must not regress the absent-today gate.
        reminderState.stampSeen(LocalDate.of(2026, 6, 9))

        assertEquals(LocalDate.of(2026, 6, 10), reminderState.lastSeenOn())
    }

    @Test
    fun `stamping last-seen leaves a recorded last-reminder-sent untouched`() {
        val sentAt = Instant.parse("2026-06-09T09:00:00Z")
        reminderState.stampReminderSent(sentAt)
        reminderState.stampSeen(LocalDate.of(2026, 6, 10))

        // The two stamps share one row but must not clobber one another.
        assertEquals(sentAt, reminderState.lastReminderSentAt())
        assertEquals(LocalDate.of(2026, 6, 10), reminderState.lastSeenOn())
    }

    @Test
    fun `a Recipe rolls up its ingredients and round-trips`() {
        val oats = foods.insert(Food.plain(null, "Oats", null, Nutrition(389.0, 16.9, 66.3, 6.9)))
        val milk = foods.insert(Food.plain(null, "Milk", null, Nutrition(64.0, 3.4, 4.8, 3.6)))
        val saved = recipes.insert(
            Recipe(
                id = null,
                name = "Porridge",
                ingredients = listOf(RecipeIngredient(oats, 80.0), RecipeIngredient(milk, 300.0)),
                cookedWeightG = 360.0,
            ),
        )
        assertNotNull(saved.id)

        val loaded = recipes.findById(saved.id!!)
        assertNotNull(loaded)
        assertEquals(2, loaded.ingredients.size)
        // (389*0.8 + 64*3.0) = 503.2 kcal over 360 g of finished dish
        assertEquals(503.2 / 360.0 * 100.0, loaded.nutrition().caloriesPer100g, 0.1)
    }
}
