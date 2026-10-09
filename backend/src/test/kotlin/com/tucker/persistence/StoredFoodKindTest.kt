package com.tucker.persistence

import com.tucker.domain.Food
import com.tucker.domain.Nutrition
import com.tucker.jooq.Tables.FOOD
import com.tucker.security.WithTuckerUser
import org.jooq.DSLContext
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/** How a stored `food` row's kind columns read back into a [com.tucker.domain.FoodKind]. */
@SpringBootTest
@Transactional
@WithTuckerUser
class StoredFoodKindTest {

    @Autowired lateinit var foods: FoodRepository
    @Autowired lateinit var dsl: DSLContext

    @Test
    fun `a Recipe row stored without a cooked weight is refused when it is read`() {
        val stew = foods.insert(Food.plain(foods.nextId(), "Stew", null, Nutrition(120.0, 9.0, 8.0, 5.0)))
        dsl.update(FOOD).set(FOOD.KIND, "RECIPE").where(FOOD.ID.eq(stew.id.toInt())).execute()

        val refusal = assertFailsWith<IllegalArgumentException> { foods.findById(stew.id) }

        assertEquals("Recipe 'Stew' is stored without a cooked weight", refusal.message)
    }
}
