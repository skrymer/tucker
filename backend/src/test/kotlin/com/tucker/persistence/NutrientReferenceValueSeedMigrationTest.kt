package com.tucker.persistence

import com.tucker.domain.Micronutrient
import com.tucker.domain.Sex
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import kotlin.test.assertEquals

/**
 * V18 seeds the **Nutrient Reference Values** (NHMRC) as the lines a Micronutrient
 * Intake is read against (issue #279, ADR 0027).
 *
 * A missing row is silent in exactly the way that matters: the nutrient still has
 * an amount, still ranks, and simply never earns a claim — so it drops out of the
 * figures into the not-enough-matched list looking like poor coverage rather than
 * like a hole in the seed.
 */
class NutrientReferenceValueSeedMigrationTest {

    @TempDir lateinit var tempDir: Path

    @Test
    fun `every nutrient carries a band for both sexes from the youngest age seeded`() {
        migrated().use { connection ->
            val seeded = connection.rows(
                "SELECT nutrient, sex FROM nutrient_reference_value WHERE from_age = 14",
            ).toSet()
            val expected = Micronutrient.entries
                .flatMap { nutrient -> Sex.entries.map { "$nutrient|$it" } }
                .toSet()

            assertEquals(
                emptySet(),
                expected - seeded,
                "resolution reads the newest band a body has passed, so a nutrient missing " +
                    "the youngest band resolves to nothing for everybody",
            )
        }
    }

    @Test
    fun `a nutrient carries a line only where one can be read against food eaten`() {
        migrated().use { connection ->
            assertEquals(
                listOf(
                    "CALCIUM|2500.0|UPPER_LEVEL",
                    "FIBRE||",
                    "FOLATE||",
                    "IODINE|1100.0|UPPER_LEVEL",
                    "IRON|45.0|UPPER_LEVEL",
                    "MAGNESIUM||",
                    "NIACIN||",
                    "POTASSIUM||",
                    "RIBOFLAVIN||",
                    "SELENIUM|400.0|UPPER_LEVEL",
                    "SODIUM|2000.0|SUGGESTED_DIETARY_TARGET",
                    "THIAMIN||",
                    "VITAMIN_A||",
                    "VITAMIN_B12||",
                    "VITAMIN_B6|50.0|UPPER_LEVEL",
                    "VITAMIN_C||",
                    "VITAMIN_D|80.0|UPPER_LEVEL",
                    "VITAMIN_E|300.0|UPPER_LEVEL",
                    "ZINC|40.0|UPPER_LEVEL",
                ),
                connection.rows(
                    """
                    SELECT nutrient, limit_amount, limit_kind FROM nutrient_reference_value v
                    WHERE sex = 'MALE' AND from_age = (
                        SELECT max(from_age) FROM nutrient_reference_value b
                        WHERE b.nutrient = v.nutrient AND b.sex = v.sex AND b.from_age <= 30
                    )
                    ORDER BY nutrient
                    """.trimIndent(),
                ),
                "ten of the nineteen have no line, and every one of those is absent on " +
                    "purpose: NHMRC either sets no Upper Level at all, or sets one for a " +
                    "different substance (vitamin A as preformed retinol, niacin as " +
                    "nicotinic acid, folate as folic acid) or for supplements alone " +
                    "(magnesium). An over-the-limit claim holds at any coverage, so a wrong " +
                    "line is worse than none (ADR 0027). Sodium's is the 2017 Suggested " +
                    "Dietary Target because the revision withdrew its Upper Level outright",
            )
        }
    }

    @Test
    fun `sodium has no figure to reach, because its published one is a range`() {
        migrated().use { connection ->
            assertEquals(
                listOf("4|0"),
                connection.rows(
                    "SELECT count(*), count(recommended) FROM nutrient_reference_value " +
                        "WHERE nutrient = 'SODIUM'",
                ),
                "the AI is 460-920 mg/day, and clearing the bottom of a range is not a " +
                    "finding worth publishing — so sodium is the one nutrient with a line " +
                    "not to cross and nothing to reach. Four rows, not ten: NHMRC publishes " +
                    "its bands at 14 and 18, because the 2017 revision reaches adults alone",
            )
        }
    }

    private fun migrated() = migratedDatabase(tempDir, "nrv.db")
}
