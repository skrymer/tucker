package com.tucker.persistence

import com.tucker.domain.Food
import com.tucker.domain.Nutrition
import com.tucker.domain.Recipe
import com.tucker.domain.RecipeIngredient
import com.tucker.domain.TagName
import com.tucker.jooq.Tables.TAG
import com.tucker.security.CurrentUser
import com.tucker.security.WithTuckerUser
import org.jooq.DSLContext
import org.jooq.ExecuteContext
import org.jooq.ExecuteListener
import org.jooq.ExecuteListenerProvider
import org.jooq.impl.DefaultExecuteListenerProvider
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.transaction.annotation.Transactional
import kotlin.test.assertTrue

/**
 * A link table carries no `user_id`, so it is owned through the rows it joins (ADR 0021,
 * ADR 0033) — and every statement that writes one still names the owner, "reachable or
 * not". A scoped read upstream makes the unscoped form safe today, which is exactly why no
 * behaviour test can catch it and this one watches the SQL instead.
 */
@SpringBootTest
@Transactional
@WithTuckerUser
class LinkTableOwnerPredicateTest {

    @Autowired lateinit var foods: FoodRepository
    @Autowired lateinit var recipes: RecipeRepository
    @Autowired lateinit var tags: TagRepository
    @Autowired lateinit var dsl: DSLContext
    @Autowired lateinit var currentUser: CurrentUser
    @Autowired lateinit var recorder: StatementRecorder

    @Test
    fun `retagging a Food removes its old links only through the owner`() {
        val snack = dsl.insertInto(TAG, TAG.USER_ID, TAG.NAME).values(currentUser.ownerId, "snack")
            .returning(TAG.ID).fetchOne()!!.id!!.toLong()
        val oats = foods.insert(
            Food.plain(null, "Rolled oats", null, Nutrition.fromMacros(13.0, 60.0, 7.0)),
        )

        recorder.statements.clear()
        foods.update(oats.retagged(listOf(snack)))

        assertOwnerNamedByEveryDeleteFrom("food_tag")
    }

    @Test
    fun `editing a Recipe removes its old ingredient lines only through the owner`() {
        val oats = foods.insert(Food.plain(null, "Oats", null, Nutrition.fromMacros(16.9, 66.3, 6.9)))
        val porridge = recipes.insert(
            Recipe(null, "Porridge", listOf(RecipeIngredient(oats, 80.0)), cookedWeightG = 300.0),
        )

        recorder.statements.clear()
        recipes.update(porridge.copy(cookedWeightG = 320.0))

        assertOwnerNamedByEveryDeleteFrom("recipe_ingredient")
    }

    @Test
    fun `merging a Tag moves its links only through the owner`() {
        val snack = tags.insert(TagName("snack")).id!!
        val treats = tags.insert(TagName("treats")).id!!
        foods.insert(Food.plain(null, "Biscuit", null, Nutrition.fromMacros(6.0, 70.0, 20.0)).retagged(listOf(treats)))

        recorder.statements.clear()
        tags.merge(from = treats, into = snack)

        val inserts = recorder.statements.map { it.lowercase() }.filter { it.startsWith("insert into food_tag ") }
        assertTrue(inserts.isNotEmpty(), "expected an INSERT on food_tag, recorded: ${recorder.statements}")
        inserts.forEach {
            assertTrue("food.user_id" in it, "an INSERT on food_tag reaches Foods not through the owner: $it")
            assertTrue("tag.user_id" in it, "an INSERT on food_tag reaches a Tag not through the owner: $it")
        }
    }

    private fun assertOwnerNamedByEveryDeleteFrom(table: String) {
        val deletes = recorder.statements.map { it.lowercase() }
            .filter { it.startsWith("delete from $table ") }
        assertTrue(deletes.isNotEmpty(), "expected a DELETE on $table, recorded: ${recorder.statements}")
        deletes.forEach { assertTrue("user_id" in it, "a DELETE on $table names no owner: $it") }
    }

    @TestConfiguration
    class RecordStatements {
        @Bean fun statementRecorder() = StatementRecorder()

        @Bean fun recordingListener(recorder: StatementRecorder): ExecuteListenerProvider =
            DefaultExecuteListenerProvider(recorder)
    }

    /** Every statement jOOQ executes, as rendered. */
    class StatementRecorder : ExecuteListener {
        val statements = mutableListOf<String>()

        override fun executeStart(ctx: ExecuteContext) {
            ctx.sql()?.let(statements::add)
        }
    }
}
