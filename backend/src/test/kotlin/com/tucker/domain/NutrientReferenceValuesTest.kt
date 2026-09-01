package com.tucker.domain

import org.junit.jupiter.api.Test
import java.time.LocalDate
import kotlin.test.assertEquals

/**
 * The published **Nutrient Reference Values** resolved for one body (CONTEXT.md,
 * ADR 0027) — which band a User falls in, and what that band publishes.
 */
class NutrientReferenceValuesTest {

    @Test
    fun `a body reads the band in force at its age`() {
        val values = NutrientReferenceValues(
            listOf(
                band(fromAge = 19, recommended = 1000.0),
                band(fromAge = 71, recommended = 1300.0),
            ),
        )

        val resolved = values.forBody(profile(born = 1970), on = LocalDate.of(2026, 8, 27))

        assertEquals(
            ReferenceIntake(recommended = 1000.0, limit = null),
            resolved[Micronutrient.CALCIUM],
            "a 56-year-old has passed the band opening at 19 and not the one opening at 71, " +
                "so the figure read is the older band's — not the last row seeded",
        )
    }

    @Test
    fun `a band opening at a body's exact age is the one in force`() {
        val values = NutrientReferenceValues(
            listOf(
                band(fromAge = 19, recommended = 1000.0),
                band(fromAge = 51, recommended = 1300.0),
            ),
        )

        // Turns 51 on 1 January 1975 + 51 years, so on this day they are exactly 51.
        val resolved = values.forBody(profile(born = 1975), on = LocalDate.of(2026, 8, 27))

        assertEquals(
            ReferenceIntake(recommended = 1300.0, limit = null),
            resolved[Micronutrient.CALCIUM],
            "a band is in force *from* the age it opens at, so somebody who has just " +
                "reached it reads the new figure rather than the one they have left",
        )
    }

    @Test
    fun `the band read is the newest one passed, not the last one seeded`() {
        val values = NutrientReferenceValues(
            listOf(
                band(fromAge = 71, recommended = 1300.0),
                band(fromAge = 19, recommended = 1000.0),
            ),
        )

        val resolved = values.forBody(profile(born = 1990), on = LocalDate.of(2026, 8, 27))

        assertEquals(
            ReferenceIntake(recommended = 1000.0, limit = null),
            resolved[Micronutrient.CALCIUM],
            "seeded order is not age order, so the band in force is chosen by its own " +
                "opening age — a 36-year-old reads the 19 band however the rows arrived",
        )
    }

    private fun band(fromAge: Int, recommended: Double) = ReferenceIntakeBand(
        nutrient = Micronutrient.CALCIUM,
        sex = Sex.MALE,
        fromAge = fromAge,
        intake = ReferenceIntake(recommended = recommended, limit = null),
    )

    private fun profile(born: Int) = Profile(
        sex = Sex.MALE,
        birthDate = LocalDate.of(born, 1, 1),
        heightCm = 180.0,
    )
}
