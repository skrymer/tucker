package com.tucker.domain

import org.junit.jupiter.api.Test
import java.time.LocalDate
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ReviewCadenceTest {

    private val today = LocalDate.of(2026, 6, 10)

    @Test
    fun `a review a full week old is overdue`() {
        assertTrue(ReviewCadence.isOverdue(today.minusDays(7), today))
    }

    @Test
    fun `a review a day short of the cadence is not overdue`() {
        assertFalse(ReviewCadence.isOverdue(today.minusDays(6), today))
    }

    @Test
    fun `a missing review counts as overdue so the first one is due`() {
        assertTrue(ReviewCadence.isOverdue(null, today))
    }
}
