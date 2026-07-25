package com.tucker.domain

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

class PaceTest {

    @Test
    fun `pace is the protein per 100 kcal the day must average to reach the floor inside the budget`() {
        val pace = Pace.from(calorieBudgetKcal = 2492.0, proteinFloorG = 170.0)

        assertEquals(6.82, pace.gPer100Kcal, 0.01)
    }
}
