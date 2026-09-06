package com.tucker.domain

import org.junit.jupiter.api.Test
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/**
 * The ranking rules of Frequent Foods (CONTEXT.md, ADR 0028). Selecting the
 * window's Entries and counting them is the repository's job — these are the
 * rules that turn those counts into the order a User is offered.
 */
class FrequentFoodsTest {

    private val to = LocalDate.of(2026, 9, 6)
    private val from = to.minusDays(FrequentFoods.WINDOW_DAYS - 1L)

    private fun logged(foodId: Long, entryCount: Int, lastLoggedOn: LocalDate = to) =
        FoodLogCount(foodId = foodId, entryCount = entryCount, lastLoggedOn = lastLoggedOn)

    @Test
    fun `the Food logged most often in the window comes first`() {
        val ranked = FrequentFoods.rank(
            from, to,
            listOf(logged(foodId = 1, entryCount = 3), logged(foodId = 2, entryCount = 11)),
        )

        assertEquals(listOf(2L, 1L), ranked.map { it.foodId })
    }

    @Test
    fun `two Foods logged as often as each other are ordered by the more recently logged`() {
        val ranked = FrequentFoods.rank(
            from, to,
            listOf(
                logged(foodId = 1, entryCount = 4, lastLoggedOn = to.minusDays(9)),
                logged(foodId = 2, entryCount = 4, lastLoggedOn = to.minusDays(1)),
            ),
        )

        assertEquals(listOf(2L, 1L), ranked.map { it.foodId })
    }

    @Test
    fun `only the ten most logged Foods are offered, however many the window holds`() {
        val fifteen = (1L..15L).map { logged(foodId = it, entryCount = it.toInt()) }

        val ranked = FrequentFoods.rank(from, to, fifteen)

        assertEquals(FrequentFoods.CAP, ranked.size)
        // The ten biggest counts, biggest first — the cap takes the tail, never the head.
        assertEquals((15L downTo 6L).toList(), ranked.map { it.foodId })
    }

    @Test
    fun `a window nothing was logged in has no Frequent Foods at all`() {
        // Never a fallback to a longer window or an all-time count (CONTEXT.md).
        assertEquals(emptyList(), FrequentFoods.rank(from, to, emptyList()))
    }

    @Test
    fun `a window that is not the trailing thirty days is refused rather than ranked`() {
        val counts = listOf(logged(foodId = 1, entryCount = 2))

        // Both directions: a wider window is as wrong as a narrower one, and only
        // the wide side distinguishes "exactly thirty days" from "at least".
        assertFailsWith<IllegalArgumentException> { FrequentFoods.rank(from.plusDays(1), to, counts) }
        assertFailsWith<IllegalArgumentException> { FrequentFoods.rank(from.minusDays(1), to, counts) }
    }

    @Test
    fun `a count last logged outside the window is refused rather than ranked`() {
        assertFailsWith<IllegalArgumentException> {
            FrequentFoods.rank(from, to, listOf(logged(foodId = 1, entryCount = 2, lastLoggedOn = from.minusDays(1))))
        }
    }

    @Test
    fun `a count logged on either edge of the window is inside it`() {
        // Both bounds are inclusive, and only the first day distinguishes that
        // from a window that starts the day after.
        val edges = listOf(
            logged(foodId = 1, entryCount = 2, lastLoggedOn = from),
            logged(foodId = 2, entryCount = 1, lastLoggedOn = to),
        )

        assertEquals(listOf(1L, 2L), FrequentFoods.rank(from, to, edges).map { it.foodId })
    }

    @Test
    fun `Foods tied on both count and day are ordered so the same request answers the same way`() {
        // The commonest real shape: a steady rotation logged the same number of
        // times, all last logged today. Without a third key the cap drops
        // whichever the database happened to emit last.
        val eleven = (1L..11L).map { logged(foodId = it, entryCount = 2) }

        val ranked = FrequentFoods.rank(from, to, eleven.reversed())

        assertEquals((1L..10L).toList(), ranked.map { it.foodId })
    }
}
