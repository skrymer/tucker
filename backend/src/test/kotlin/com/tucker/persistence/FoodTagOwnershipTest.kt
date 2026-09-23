package com.tucker.persistence

import com.tucker.domain.Food
import com.tucker.domain.Nutrition
import com.tucker.jooq.Tables.TAG
import com.tucker.jooq.Tables.USER
import com.tucker.security.WithTuckerUser
import org.jooq.DSLContext
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional
import kotlin.test.assertEquals

/**
 * The Food ↔ Tag link is owned through both ends (ADR 0033, ADR 0021), and the
 * repository that writes it holds both ends itself rather than trusting a caller to
 * have checked the Tag.
 */
@SpringBootTest
@Transactional
@WithTuckerUser
class FoodTagOwnershipTest {

    @Autowired lateinit var foods: FoodRepository
    @Autowired lateinit var dsl: DSLContext

    @Test
    fun `a Food saved wearing another User's Tag does not come to wear it`() {
        val someoneElse = dsl.insertInto(USER, USER.EMAIL).values("someone-else@tucker.invalid")
            .returning(USER.ID).fetchOne()!!.id!!
        val theirTag = dsl.insertInto(TAG, TAG.USER_ID, TAG.NAME).values(someoneElse, "breakfast")
            .returning(TAG.ID).fetchOne()!!.id!!.toLong()
        val oats = foods.insert(
            Food.plain(null, "Rolled oats", null, Nutrition.fromMacros(13.0, 60.0, 7.0)),
        )

        foods.update(oats.retagged(listOf(theirTag)))

        assertEquals(emptySet(), foods.findById(oats.id!!)!!.tagIds)
    }
}
