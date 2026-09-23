package com.tucker.persistence

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import java.sql.SQLException
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * V20 adds `tag` and the `food_tag` link (ADR 0033). Additive only, so what is worth
 * pinning is what the schema itself promises: a Tag's name is one User's and matched
 * ignoring case, and each side of the link survives the other being deleted.
 */
class TagMigrationTest {

    @TempDir lateinit var tempDir: Path

    @Test
    fun `one User cannot hold two Tags whose names differ only in case`() {
        migratedDatabase(tempDir, "tag-name-unique.db").use { connection ->
            connection.seedOwner()
            connection.execute("INSERT INTO tag (user_id, name) VALUES ($OWNER_ID, 'Breakfast')")

            val refusal = assertFailsWith<SQLException> {
                connection.execute("INSERT INTO tag (user_id, name) VALUES ($OWNER_ID, 'breakfast')")
            }
            assertTrue(
                refusal.message.orEmpty().contains("UNIQUE"),
                "the second spelling was refused for the wrong reason: ${refusal.message}",
            )
        }
    }

    @Test
    fun `deleting a Food takes its Tags off it and deletes no Tag`() {
        migratedDatabase(tempDir, "food-delete.db").use { connection ->
            connection.seedOwner()
            connection.execute(
                "INSERT INTO food (id, name, calories_per_100g, protein_per_100g, user_id) " +
                    "VALUES (1, 'Rolled oats', 379.0, 13.0, $OWNER_ID)",
            )
            connection.execute("INSERT INTO tag (id, user_id, name) VALUES (1, $OWNER_ID, 'breakfast')")
            connection.execute("INSERT INTO food_tag (food_id, tag_id) VALUES (1, 1)")

            connection.execute("DELETE FROM food WHERE id = 1")

            assertEquals(emptyList(), connection.rows("SELECT food_id FROM food_tag"))
            assertEquals(listOf("1|breakfast"), connection.rows("SELECT id, name FROM tag"))
        }
    }

    @Test
    fun `deleting a Tag takes it off every Food and deletes no Food`() {
        migratedDatabase(tempDir, "tag-delete.db").use { connection ->
            connection.seedOwner()
            connection.execute(
                "INSERT INTO food (id, name, calories_per_100g, protein_per_100g, user_id) " +
                    "VALUES (1, 'Rolled oats', 379.0, 13.0, $OWNER_ID)",
            )
            connection.execute("INSERT INTO tag (id, user_id, name) VALUES (1, $OWNER_ID, 'breakfast')")
            connection.execute("INSERT INTO food_tag (food_id, tag_id) VALUES (1, 1)")

            connection.execute("DELETE FROM tag WHERE id = 1")

            assertEquals(emptyList(), connection.rows("SELECT tag_id FROM food_tag"))
            assertEquals(listOf("1|Rolled oats"), connection.rows("SELECT id, name FROM food"))
        }
    }

    @Test
    fun `two Users may each keep a Tag of the same name`() {
        migratedDatabase(tempDir, "tag-name-per-user.db").use { connection ->
            connection.seedTwoUsers()
            connection.execute("INSERT INTO tag (user_id, name) VALUES ($OWNER_ID, 'breakfast')")
            connection.execute("INSERT INTO tag (user_id, name) VALUES ($SECOND_USER_ID, 'Breakfast')")

            assertEquals(
                listOf("$OWNER_ID|breakfast", "$SECOND_USER_ID|Breakfast"),
                connection.rows("SELECT user_id, name FROM tag ORDER BY user_id"),
            )
        }
    }
}
