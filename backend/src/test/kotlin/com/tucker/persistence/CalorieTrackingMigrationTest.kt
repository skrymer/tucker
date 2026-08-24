package com.tucker.persistence

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import java.sql.SQLException
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * V14 adds `profile.tracks_calories` (issue #247, CONTEXT.md "Calorie Tracking").
 *
 * The same shape as [ProfileAndRemindersMigrationTest], for the same reason: the one
 * thing an `ADD COLUMN ... DEFAULT` does that an empty database cannot show is what it
 * writes into the rows that are already there. So this fills the table the way a real
 * installation fills it, and only then migrates forward.
 */
class CalorieTrackingMigrationTest {

    @TempDir lateinit var tempDir: Path

    /**
     * The deploy criterion, and the whole reason the default is 1: the two live Users
     * decided nothing, so neither of them may lose half their app to this migration.
     */
    @Test
    fun `a Profile recorded before the setting existed keeps every value, and keeps tracking calories`() {
        val db = tempDir.resolve("pre-calorie-tracking.db").toString()

        migrate(db, upTo = "13")
        connect(db).use { connection ->
            connection.seedOwner()
            // Every column away from its schema default, so a value the migration
            // disturbed reads back as something this assertion can see.
            connection.execute(
                "INSERT INTO profile (id, sex, birth_date, height_cm, timezone, reminder_hour, " +
                    "reminders_enabled, user_id) VALUES (1, 'FEMALE', '1991-11-03', 172.5, " +
                    "'Australia/Brisbane', 21, 1, $OWNER_ID)",
            )
        }

        migrate(db, upTo = null)

        connect(db).use { connection ->
            assertEquals(
                listOf("1|FEMALE|1991-11-03|172.5|Australia/Brisbane|21|1|1|1"),
                connection.rows(
                    "SELECT id, sex, birth_date, height_cm, timezone, reminder_hour, " +
                        "reminders_enabled, user_id, tracks_calories FROM profile",
                ),
                "an existing Profile must come through with Calorie Tracking on and nothing " +
                    "else touched — backfilling it off would take the log, the Calorie Budget " +
                    "and the Protein Floor away from a User who chose none of that",
            )
        }
    }

    /**
     * Whether a User tracks calories is a deliberate answer, so there is no third state
     * for a row to sit in while nobody has given one.
     */
    @Test
    fun `a Profile cannot be recorded with no answer to whether it tracks calories`() {
        val db = tempDir.resolve("tracks-calories-not-null.db").toString()
        migrate(db, upTo = null)

        connect(db).use { connection ->
            connection.seedOwner()

            val refusal = assertFailsWith<SQLException>(
                "`profile.tracks_calories` should refuse a row that answers neither way",
            ) {
                connection.execute(
                    "INSERT INTO profile (sex, birth_date, height_cm, user_id, tracks_calories) " +
                        "VALUES ('MALE', '1986-05-22', 180.0, $OWNER_ID, NULL)",
                )
            }
            // An INSERT can be refused for the wrong reason -- a typo in the column
            // list reads as a pass otherwise, while the column stays nullable.
            assertTrue(
                refusal.message.orEmpty().contains("NOT NULL"),
                "the row was refused for the wrong reason: ${refusal.message}",
            )
        }
    }
}
