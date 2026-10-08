package com.tucker.persistence

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import kotlin.test.assertEquals

/**
 * V21 adds `id_sequence` (ADR 0036). What an empty database cannot show is where each
 * sequence starts on one that already holds rows: past the highest id there, or the
 * first id handed out collides with a row already stored.
 */
class IdSequenceMigrationTest {

    @TempDir lateinit var tempDir: Path

    @Test
    fun `each sequence starts from the highest id its table already holds`() {
        val db = tempDir.resolve("pre-id-sequence.db").toString()

        migrate(db, upTo = "20")
        connect(db).use { connection ->
            connection.seedOwner()
            connection.execute(
                "INSERT INTO food (id, name, calories_per_100g, protein_per_100g, user_id) " +
                    "VALUES (41, 'Oats', 389.0, 16.9, $OWNER_ID)",
            )
            connection.execute("INSERT INTO tag (id, user_id, name) VALUES (7, $OWNER_ID, 'Breakfast')")
        }

        migrate(db, upTo = null)

        connect(db).use { connection ->
            assertEquals(
                listOf(
                    "entry|0",
                    "food|41",
                    "goal|0",
                    "tag|7",
                    "user|$OWNER_ID",
                    "weekly_review|0",
                    "weight_measurement|0",
                ),
                connection.rows("SELECT name, last_id FROM id_sequence ORDER BY name"),
                "every table an aggregate is stored in starts past its highest id, and an " +
                    "empty one from zero",
            )
        }
    }
}
