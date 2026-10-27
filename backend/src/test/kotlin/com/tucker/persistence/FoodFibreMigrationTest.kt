package com.tucker.persistence

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import kotlin.test.assertEquals

/**
 * V28 gives a Food an optional fibre (ADR 0040). No Food stored before it states one,
 * and *not stated is not zero*, so every existing Food reads null — with the calories
 * it was stored with, since an unstated fibre contributes none.
 */
class FoodFibreMigrationTest {

    @TempDir lateinit var tempDir: Path

    @Test
    fun `a Food stored before fibre reads not stated, with its calories unchanged`() {
        val db = tempDir.resolve("pre-fibre.db").toString()

        migrate(db, upTo = "27")
        connect(db).use { connection ->
            connection.seedOwner()
            connection.execute(
                "INSERT INTO food (id, name, calories_per_100g, protein_per_100g, carbs_per_100g, " +
                    "fat_per_100g, user_id) VALUES (41, 'Oats', 389.0, 16.9, 66.3, 6.9, $OWNER_ID)",
            )
        }

        migrate(db, upTo = null)

        connect(db).use { connection ->
            assertEquals(
                listOf("389.0|1"),
                connection.rows("SELECT calories_per_100g, fibre_per_100g IS NULL FROM food WHERE id = 41"),
            )
        }
    }

    @Test
    fun `an Entry logged before fibre keeps its snapshot`() {
        val db = tempDir.resolve("pre-fibre-entry.db").toString()

        migrate(db, upTo = "27")
        connect(db).use { connection ->
            connection.seedOwner()
            connection.execute(
                "INSERT INTO food (id, name, calories_per_100g, protein_per_100g, carbs_per_100g, " +
                    "fat_per_100g, user_id) VALUES (41, 'Oats', 389.0, 16.9, 66.3, 6.9, $OWNER_ID)",
            )
            connection.execute(
                "INSERT INTO entry (id, logged_on, kind, food_id, grams, calories, protein, user_id) " +
                    "VALUES (7, '2026-10-01', 'WEIGHED', 41, 50.0, 194.5, 8.45, $OWNER_ID)",
            )
        }

        migrate(db, upTo = null)

        connect(db).use { connection ->
            assertEquals(
                listOf("41|50.0|194.5|8.45"),
                connection.rows("SELECT food_id, grams, calories, protein FROM entry WHERE id = 7"),
            )
        }
    }
}
