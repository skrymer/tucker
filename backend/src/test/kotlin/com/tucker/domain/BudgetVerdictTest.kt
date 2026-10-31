package com.tucker.domain

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class BudgetVerdictTest {

    @Test
    fun `intake one calorie past the budget is slightly over`() {
        assertEquals(BudgetVerdict.SLIGHTLY_OVER, BudgetVerdict.of(intakeKcal = 2001.0, budgetKcal = 2000.0))
    }

    @Test
    fun `intake exactly at the budget is within it`() {
        assertEquals(BudgetVerdict.WITHIN_BUDGET, BudgetVerdict.of(intakeKcal = 2000.0, budgetKcal = 2000.0))
    }

    @Test
    fun `intake at exactly the tolerance is still slightly over`() {
        assertEquals(BudgetVerdict.SLIGHTLY_OVER, BudgetVerdict.of(intakeKcal = 2200.0, budgetKcal = 2000.0))
    }

    @Test
    fun `one calorie past the budget is past it, at the budget is not`() {
        assertTrue(BudgetVerdict.isPastBudget(intakeKcal = 2001.0, budgetKcal = 2000.0))
        assertFalse(BudgetVerdict.isPastBudget(intakeKcal = 2000.0, budgetKcal = 2000.0))
    }

    @Test
    fun `intake just past the tolerance is over budget`() {
        assertEquals(BudgetVerdict.OVER_BUDGET, BudgetVerdict.of(intakeKcal = 2200.5, budgetKcal = 2000.0))
    }
}
