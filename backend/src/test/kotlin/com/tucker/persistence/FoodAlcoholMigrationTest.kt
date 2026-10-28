package com.tucker.persistence

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import kotlin.test.assertEquals

/**
 * V29 gives a Food an optional alcohol (ADR 0040). No Food stored before it states one,
 * and *not stated is not zero*, so every existing Food reads null — with the calories
 * it was stored with, since an unstated alcohol contributes none.
 */
class FoodAlcoholMigrationTest {

    @TempDir lateinit var tempDir: Path

    @Test
    fun `a Food stored before alcohol reads not stated, with its calories unchanged`() {
        val db = tempDir.resolve("pre-alcohol.db").toString()

        migrate(db, upTo = "28")
        connect(db).use { connection ->
            connection.seedOwner()
            connection.execute(
                "INSERT INTO food (id, name, calories_per_100g, protein_per_100g, carbs_per_100g, " +
                    "fat_per_100g, fibre_per_100g, user_id) " +
                    "VALUES (41, 'Oats', 389.0, 16.9, 66.3, 6.9, 10.1, $OWNER_ID)",
            )
        }

        migrate(db, upTo = null)

        connect(db).use { connection ->
            assertEquals(
                listOf("389.0|10.1|1"),
                connection.rows(
                    "SELECT calories_per_100g, fibre_per_100g, alcohol_per_100g IS NULL FROM food WHERE id = 41",
                ),
            )
        }
    }
}
