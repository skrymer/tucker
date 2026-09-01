package com.tucker.domain

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

/** What Tucker reads a window of food for, and — as deliberately — what it does not. */
class MicronutrientTest {

    @Test
    fun `the set is the nineteen AFCD populates, and neither protein nor energy`() {
        assertEquals(
            listOf(
                "Dietary fibre", "Calcium", "Iodine", "Iron", "Magnesium", "Potassium",
                "Selenium", "Sodium", "Zinc", "Vitamin A", "Thiamin", "Riboflavin",
                "Niacin", "Vitamin B6", "Vitamin B12", "Folate", "Vitamin C",
                "Vitamin D", "Vitamin E",
            ),
            Micronutrient.entries.map { it.label },
            "written out rather than derived, because membership is a decision and not a " +
                "consequence: protein is excluded although Tucker has a figure for it — the " +
                "Protein Floor is set from body weight and the published reference is a " +
                "quite different and much lower number, so two protein lines on one screen " +
                "is Tucker contradicting itself about the one macro it targets. Energy and " +
                "the other macros go with it, and dietary fibre stays on the test sodium " +
                "passes (CONTEXT.md, ADR 0027)",
        )
    }
}
