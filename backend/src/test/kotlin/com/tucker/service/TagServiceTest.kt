package com.tucker.service

import com.tucker.api.NotFoundException
import com.tucker.domain.Food
import com.tucker.domain.Nutrition
import com.tucker.domain.TagName
import com.tucker.persistence.FoodRepository
import com.tucker.persistence.TagRepository
import com.tucker.security.WithTuckerUser
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/** Renaming a Tag, and merging it by renaming it onto another (ADR 0033). */
@SpringBootTest
@Transactional
@WithTuckerUser
class TagServiceTest {

    @Autowired lateinit var service: TagService
    @Autowired lateinit var tags: TagRepository
    @Autowired lateinit var foods: FoodRepository

    private fun food(name: String, vararg tagIds: Long): Food = foods.insert(
        Food.plain(null, name, null, Nutrition.fromMacros(10.0, 10.0, 1.0)).retagged(tagIds.toList()),
    )

    @Test
    fun `a renamed Tag is on every Food that carried it, under its new name`() {
        val breakfast = tags.insert(TagName("breakfast")).id!!
        val oats = food("Rolled oats", breakfast)

        service.rename(breakfast, TagName("morning"))

        assertEquals(listOf("morning" to 1), tags.findAllWithFoodCounts().map { it.tag.name.value to it.foodCount })
        assertEquals(setOf(breakfast), foods.findById(oats.id!!)!!.tagIds)
    }

    @Test
    fun `merging leaves every Food of either Tag carrying exactly the Tag that existed`() {
        val snack = tags.insert(TagName("Snack")).id!!
        val treats = tags.insert(TagName("treats")).id!!
        val apple = food("Apple", snack)
        val chocolate = food("Chocolate", treats)
        val biscuit = food("Biscuit", snack, treats)

        service.rename(treats, TagName("snack"))

        assertEquals(listOf("Snack" to 3), tags.findAllWithFoodCounts().map { it.tag.name.value to it.foodCount })
        listOf(apple, chocolate, biscuit).forEach {
            assertEquals(setOf(snack), foods.findById(it.id!!)!!.tagIds, it.name)
        }
    }

    @Test
    fun `renaming a Tag the User does not have is not found`() {
        tags.insert(TagName("breakfast"))

        assertFailsWith<NotFoundException> { service.rename(Long.MAX_VALUE, TagName("morning")) }
        assertEquals(listOf("breakfast"), tags.findAllWithFoodCounts().map { it.tag.name.value })
    }
}
