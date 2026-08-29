package com.tucker.persistence

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * V16 seeds `reference_food` from the Australian Food Composition Database
 * (issue #278, ADR 0027), and V17 builds the search index over it.
 *
 * The two facts asserted here are the ones ADR 0027 rests an argument on. The
 * count is what a partial parse silently changes — a generator that skipped a
 * sheet, a header row read as data, a chunked INSERT that lost its last chunk —
 * and every one of those leaves a table that reads and searches perfectly well.
 * The absence of nulls is load-bearing for the decision to ship **no fallback
 * source**: a hole in a curated nutrient would be the thing USDA was refused for
 * not being able to fill safely.
 */
class ReferenceFoodSeedMigrationTest {

    @TempDir lateinit var tempDir: Path

    @Test
    fun `every food of the AFCD release is seeded`() {
        migrated().use { connection ->
            assertEquals(
                listOf("1588"),
                connection.rows("SELECT count(*) FROM reference_food"),
                "AFCD Release 3 holds 1,588 foods and all of them are Tucker's corpus",
            )
        }
    }

    @Test
    fun `every curated nutrient is populated on every food`() {
        migrated().use { connection ->
            val unpopulated = CURATED_NUTRIENTS.filter { column ->
                connection.rows("SELECT count(*) FROM reference_food WHERE $column IS NULL")
                    .single() != "0"
            }
            assertEquals(
                emptyList(),
                unpopulated,
                "ADR 0027 ships no fallback source because AFCD has no holes to fill",
            )
        }
    }

    @Test
    fun `a food is found by a word its name only stems to`() {
        migrated().use { connection ->
            val hits = connection.rows(
                """
                SELECT r.name FROM reference_food_fts f
                JOIN reference_food r ON r.id = f.rowid
                WHERE reference_food_fts MATCH '"almond"'
                """.trimIndent(),
            )
            assertTrue(
                hits.any { it.startsWith("Nut, almond") },
                "porter stemming is what makes `Almonds` reach `Nut, almond` at all, and " +
                    "without it the query returns nothing: was $hits",
            )
        }
    }

    @Test
    fun `the index splits a name into the food and its qualifiers`() {
        migrated().use { connection ->
            assertEquals(
                listOf("Chicken| breast, lean flesh, raw"),
                connection.rows(
                    """
                    SELECT head, rest FROM reference_food_fts
                    WHERE rowid = (SELECT id FROM reference_food
                                   WHERE name = 'Chicken, breast, lean flesh, raw')
                    """.trimIndent(),
                ),
                "an AFCD name reads `Head, qualifier, ...`, and ranking the head ten times " +
                    "heavier is what stops a qualifier deciding the match (ADR 0027)",
            )
        }
    }

    @Test
    fun `a food starts unmatched`() {
        migrated().use { connection ->
            assertTrue(
                connection.isNullable("food", "reference_food_id"),
                "coverage is structurally poor and stated rather than pretended away, so an " +
                    "unmatched Food is the ordinary case",
            )
            assertEquals(
                "reference_food",
                connection.foreignKeyTargetOf("food", "reference_food_id"),
                "the borrow is a pointer at a global row, not a copy of one (ADR 0027)",
            )
        }
    }

    private fun migrated() = tempDir.resolve("seeded.db").toString()
        .also { migrate(it, upTo = null) }
        .let { connect(it) }

    private companion object {
        /** The 19 of ADR 0027, as V16 names them. */
        val CURATED_NUTRIENTS = listOf(
            "fibre_g", "calcium_mg", "iodine_ug", "iron_mg", "magnesium_mg", "potassium_mg",
            "selenium_ug", "sodium_mg", "zinc_mg", "vitamin_a_ug", "thiamin_mg", "riboflavin_mg",
            "niacin_mg", "vitamin_b6_mg", "vitamin_b12_ug", "folate_ug", "vitamin_c_mg",
            "vitamin_d_ug", "vitamin_e_mg",
        )
    }
}
