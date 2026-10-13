package com.tucker.persistence

import com.tucker.domain.Food
import com.tucker.domain.Goal
import com.tucker.domain.Nutrition
import com.tucker.domain.Profile
import com.tucker.domain.Recipe
import com.tucker.domain.RecipeIngredient
import com.tucker.domain.Sex
import com.tucker.domain.User
import com.tucker.domain.WeightMeasurement
import com.tucker.security.WithTuckerUser
import com.tucker.security.runAs
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * A guard's projection answers for the caller alone (ADR 0021): another User's rows,
 * which the whole aggregate's read would never have loaded, never answer it either.
 */
@SpringBootTest
@Transactional
@WithTuckerUser
class ProjectionOwnerScopeTest {

    @Autowired lateinit var users: UserRepository
    @Autowired lateinit var goals: GoalRepository
    @Autowired lateinit var profiles: ProfileRepository
    @Autowired lateinit var weights: WeightMeasurementRepository
    @Autowired lateinit var foods: FoodRepository
    @Autowired lateinit var recipes: RecipeRepository

    private lateinit var someoneElse: User

    @BeforeEach
    fun seedAnotherUser() {
        someoneElse = users.insertIfAbsent(User(users.nextId(), "someone-else@tucker.invalid"))
    }

    @Test
    fun `another User's active Goal is not the caller's`() {
        runAs(someoneElse) {
            goals.insert(Goal(goals.nextId(), LocalDate.of(2026, 5, 1), 90.0, 80.0, 0.5, active = true))
        }

        assertEquals(false, goals.hasActive())
    }

    @Test
    fun `another User's Profile is not the caller's`() {
        runAs(someoneElse) { profiles.save(Profile(Sex.FEMALE, LocalDate.of(1990, 3, 2), 165.0)) }

        assertEquals(false, profiles.exists())
    }

    @Test
    fun `another User's calorie tracking is not the caller's`() {
        runAs(someoneElse) {
            profiles.save(Profile(Sex.FEMALE, LocalDate.of(1990, 3, 2), 165.0, tracksCalories = false))
        }

        assertNull(profiles.tracksCalories())
    }

    @Test
    fun `another User's weigh-in is not the caller's`() {
        runAs(someoneElse) { weights.save(WeightMeasurement(weights.nextId(), LocalDate.of(2026, 5, 22), 64.0)) }

        assertEquals(false, weights.any())
    }

    @Test
    fun `another User's Food has no name the caller can read`() {
        val theirs = runAs(someoneElse) {
            foods.insert(Food.plain(foods.nextId(), "Their oats", null, Nutrition(389.0, 16.9, 66.3, 6.9)))
        }

        assertEquals(emptyMap(), foods.namesOf(listOf(theirs.id)))
    }

    @Test
    fun `another User's Recipe is not a Recipe of the caller's`() {
        val theirs = runAs(someoneElse) {
            val oats = foods.insert(Food.plain(foods.nextId(), "Their oats", null, Nutrition(389.0, 16.9, 66.3, 6.9)))
            recipes.insert(
                Recipe(recipes.nextId(), "Their porridge", listOf(RecipeIngredient(oats, 80.0)), cookedWeightG = 300.0),
            )
        }

        assertEquals(false, foods.isRecipe(theirs.id))
    }
}
