package com.tucker.persistence

import org.flywaydb.core.api.FlywayException
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import java.sql.Connection
import java.sql.SQLException
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * V12 rebuilds `profile`, `reminder_state` and `push_subscription` so the Profile and
 * the Weekly-Review Reminder belong to a person rather than to the installation
 * (issue #159, ADR 0021).
 *
 * The same shape as [PerUserUniquenessMigrationTest], for the same reason: a table
 * rebuild copies rows by hand, so a dropped column, constraint or foreign key shows up
 * only where there is something to copy. These migrate to the last pre-multi-user
 * version, fill the schema the way one person's installation fills it, and only then
 * migrate forward — with foreign keys enforced, as Hikari enforces them in the app.
 */
class ProfileAndRemindersMigrationTest {

    @TempDir lateinit var tempDir: Path

    @Test
    fun `a User has a Profile of their own, and only one`() {
        val db = tempDir.resolve("per-user-profile.db").toString()
        migrate(db, upTo = null)

        connect(db).use { connection ->
            connection.seedTwoUsers()

            connection.execute(profileOwnedBy(OWNER_ID))
            assertFailsWith<SQLException>("a User should not be able to hold two Profiles") {
                connection.execute(profileOwnedBy(OWNER_ID))
            }
            // And somebody else's own, which must be fine — `CHECK (id = 1)` said this
            // app was for one person, and it is the whole of what this migration widens.
            connection.execute(profileOwnedBy(SECOND_USER_ID))
        }
    }

    @Test
    fun `a User has reminder bookkeeping of their own, and only one`() {
        val db = tempDir.resolve("per-user-reminder-state.db").toString()
        migrate(db, upTo = null)

        connect(db).use { connection ->
            connection.seedTwoUsers()

            connection.execute(reminderStateOwnedBy(OWNER_ID))
            // Two rows for one person is the shape that matters here, because the reads
            // are `fetchOne`-flavoured: a second row does not announce itself, it just
            // means the absent-today gate and the dedupe start answering from whichever
            // row the query happened to reach.
            assertFailsWith<SQLException>("a User should not be able to hold two reminder states") {
                connection.execute(reminderStateOwnedBy(OWNER_ID))
            }
            connection.execute(reminderStateOwnedBy(SECOND_USER_ID))
        }
    }

    /**
     * The one thing this migration deliberately does *not* widen, pinned so that a later
     * pass making everything per-User cannot sweep it up. A Web Push endpoint is issued
     * by the browser and is globally unique by nature, so two rows holding one are two
     * claims on the same device — and the app resolves that by reassignment, which is
     * only well-defined while the database refuses to hold both (ADR 0021).
     */
    @Test
    fun `a device endpoint is held by one User at a time, not one per User`() {
        val db = tempDir.resolve("global-endpoint.db").toString()
        migrate(db, upTo = null)

        connect(db).use { connection ->
            connection.seedTwoUsers()

            connection.execute(deviceOwnedBy(OWNER_ID))
            assertFailsWith<SQLException>(
                "two Users must not both hold the same endpoint — there is only one device",
            ) { connection.execute(deviceOwnedBy(SECOND_USER_ID)) }
        }
    }

    @Test
    fun `a Profile, reminder state or device recorded with no owner is refused`() {
        val db = tempDir.resolve("not-null.db").toString()
        migrate(db, upTo = null)

        connect(db).use { connection ->
            connection.seedOwner()

            REBUILT.forEach { (table, insert, _) ->
                val refusal = assertFailsWith<SQLException>(
                    "`$table` should refuse a row with no owner — the invariant the " +
                        "repositories hold is now the database's too (ADR 0021)",
                ) { connection.execute(insert) }
                assertTrue(
                    refusal.message.orEmpty().contains("NOT NULL"),
                    "`$table` refused the row for the wrong reason: ${refusal.message}",
                )
            }
        }
    }

    @Test
    fun `a database recorded before multi-user keeps its Profile, reminder state and devices`() {
        val db = tempDir.resolve("pre-multi-user.db").toString()

        migrate(db, upTo = "8")
        connect(db).use { seedOnePersonsProfileAndReminders(it) }

        migrate(db, upTo = null)

        connect(db).use { connection ->
            // Every column, not just the interesting ones: a rebuild copies by hand, and a
            // column left out of the copy reads back as the new table's DEFAULT — which is
            // indistinguishable from the real value unless the fixture avoided it.
            assertEquals(
                listOf("1|FEMALE|1991-11-03|172.5|Australia/Brisbane|21|1|1"),
                connection.rows(
                    "SELECT id, sex, birth_date, height_cm, timezone, reminder_hour, " +
                        "reminders_enabled, user_id FROM profile",
                ),
                "the Profile should come through the rebuild intact — losing timezone or " +
                    "reminder_hour to their defaults would move the reminder to 09:00 UTC, " +
                    "and losing reminders_enabled would switch reminders off outright",
            )
            assertEquals(
                listOf("1|2026-06-08|2026-06-03|1"),
                connection.rows(
                    "SELECT id, last_seen_on, last_reminder_sent_on, user_id FROM reminder_state",
                ),
                "both reminder days should survive — losing last_reminder_sent_on re-opens " +
                    "the dedupe and nudges the owner again for an episode already nudged",
            )
            assertEquals(
                listOf(
                    "1|https://push.example/phone|BPhoneKey|PhoneAuth|Pixel 7|2026-05-01 08:15:00|1",
                    "2|https://push.example/laptop|BLaptopKey|LaptopAuth||2026-05-02 09:20:00|1",
                ),
                connection.rows(
                    "SELECT id, endpoint, p256dh, auth, label, created_at, user_id " +
                        "FROM push_subscription ORDER BY id",
                ),
                "every device should come through with its keys — a dropped p256dh or auth " +
                    "is not a missing label, it is a subscription that can never be encrypted to",
            )

            // A rebuild is exactly where a foreign key gets quietly dropped: the new table
            // is hand-written, and nothing about the copied values would say so.
            REBUILT.forEach { (table, _, _) ->
                assertEquals(
                    "user",
                    connection.foreignKeyTargetOf(table, "user_id"),
                    "`$table.user_id` must still be a foreign key to `user` after the rebuild",
                )
            }
        }
    }

    /**
     * The rows written between V9 and here carry no owner, and this slice is what
     * scopes the repositories reading them — so until it runs they are not stray
     * detritus, they are live. They must be adopted, not discarded.
     */
    @Test
    fun `a Profile, reminder state and device written with no owner are adopted, not discarded`() {
        val db = tempDir.resolve("unowned.db").toString()

        // A database first written *after* V9: there was no pre-multi-user history for
        // V9 to adopt, so it seeded no owner, and everything the app wrote since carries
        // none either. The User arrives the ordinary way, just-in-time on a first visit.
        migrate(db, upTo = "11")
        connect(db).use { connection ->
            connection.seedOwner()
            REBUILT.forEach { connection.execute(it.unowned) }
        }

        migrate(db, upTo = null)

        connect(db).use { connection ->
            REBUILT.forEach { (table, _, cost) ->
                assertEquals(
                    listOf("$OWNER_ID"),
                    connection.rows("SELECT user_id FROM $table"),
                    "the unowned `$table` row is the owner's own, recorded before the column " +
                        "was filled in — dropping it would $cost",
                )
            }
        }
    }

    /**
     * The other half of the adoption rule: when attribution *would* be a guess, the
     * migration must refuse rather than pick somebody, and must leave the database
     * exactly as it found it — which is the transactional claim ADR 0021 rests on.
     *
     * Nothing asserts this from the happy path: a non-transactional V12 would pass every
     * other test in this class while leaving a half-rebuilt database behind.
     */
    @Test
    fun `an unowned Profile nobody can be attributed refuses the migration, and rolls it back`() {
        val db = tempDir.resolve("ambiguous.db").toString()
        migrate(db, upTo = "11")

        connect(db).use { connection ->
            connection.seedTwoUsers()
            connection.execute(UNOWNED_PROFILE)
        }

        assertFailsWith<FlywayException>(
            "with two Users, an unowned Profile cannot be attributed — guessing whose body " +
                "the Maintenance seed is computed from is worse than refusing",
        ) { migrate(db, upTo = null) }

        connect(db).use { connection ->
            assertEquals(
                emptyList(),
                connection.rows("SELECT version FROM flyway_schema_history WHERE version = '12'"),
                "the failed migration must not be recorded as applied",
            )
            // Rolled back *whole*, not merely unrecorded: the rebuild's own artefacts are
            // absent, so this is still the V11 database and the next boot can retry.
            assertEquals(
                emptyList(),
                connection.rows(
                    "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_profile_user'",
                ),
                "a part-applied rebuild would have left the new index behind",
            )
            assertEquals(
                listOf("1991-11-03"),
                connection.rows("SELECT birth_date FROM profile"),
                "and the row it could not attribute is still there for a human to resolve",
            )
        }
    }

    /**
     * Fill the three tables this migration rebuilds, the way one person's installation
     * fills them.
     *
     * Every column that a rebuild could drop *silently* is seeded away from its schema
     * default, because seeded at the default — which is what a casual fixture does — a
     * dropped column reads back as the value the new table's DEFAULT supplies, so the
     * test passes and production loses the data. `timezone`, `reminder_hour` and
     * `reminders_enabled` are the ones that matter: at their defaults, losing all three
     * looks identical to a user who chose UTC, 09:00 and off.
     */
    private fun seedOnePersonsProfileAndReminders(connection: Connection) =
        connection.createStatement().use {
            it.executeUpdate(
                "INSERT INTO profile (id, sex, birth_date, height_cm, timezone, reminder_hour, " +
                    "reminders_enabled) VALUES (1, 'FEMALE', '1991-11-03', 172.5, " +
                    "'Australia/Brisbane', 21, 1)",
            )
            it.executeUpdate(
                "INSERT INTO reminder_state (id, last_seen_on, last_reminder_sent_on) " +
                    "VALUES (1, '2026-06-08', '2026-06-03')",
            )
            // Two devices, one labelled and one not, so `label` is discriminating in both
            // directions — a dropped nullable column reads back as null, which is exactly
            // what an unlabelled device legitimately holds.
            it.executeUpdate(
                "INSERT INTO push_subscription (id, endpoint, p256dh, auth, label, created_at) " +
                    "VALUES (1, 'https://push.example/phone', 'BPhoneKey', 'PhoneAuth', " +
                    "'Pixel 7', '2026-05-01 08:15:00')",
            )
            it.executeUpdate(
                "INSERT INTO push_subscription (id, endpoint, p256dh, auth, created_at) " +
                    "VALUES (2, 'https://push.example/laptop', 'BLaptopKey', 'LaptopAuth', " +
                    "'2026-05-02 09:20:00')",
            )
        }

    /**
     * One rebuilt table: what an unowned row of it looks like, and what adopting rather
     * than deleting that row saves.
     *
     * A single record rather than three lists keyed by table name, because the coupling
     * between them is silent — a table seeded from one list and missing from another is
     * inserted and never asserted on, which is a test that quietly stops checking and
     * stays green.
     */
    private data class Rebuilt(val table: String, val unowned: String, val adoptionSaves: String)

    private companion object {
        /** A complete Profile, differing between calls only in who it is about. */
        fun profileOwnedBy(user: Int) =
            "INSERT INTO profile (sex, birth_date, height_cm, timezone, reminder_hour, " +
                "reminders_enabled, user_id) " +
                "VALUES ('MALE', '1986-05-22', 180.0, 'Australia/Brisbane', 9, 1, $user)"

        /** Both reminder days set, differing between calls only in whose they are. */
        fun reminderStateOwnedBy(user: Int) =
            "INSERT INTO reminder_state (last_seen_on, last_reminder_sent_on, user_id) " +
                "VALUES ('2026-06-10', '2026-06-03', $user)"

        /** One device, differing between calls only in who is claiming it. */
        fun deviceOwnedBy(user: Int) =
            "INSERT INTO push_subscription (endpoint, p256dh, auth, user_id) " +
                "VALUES ('https://push.example/shared-browser', 'BKey', 'Auth', $user)"

        /** A Profile with no owner — named, because one test seeds only this one. */
        const val UNOWNED_PROFILE =
            "INSERT INTO profile (sex, birth_date, height_cm) VALUES ('MALE', '1991-11-03', 180.0)"

        /**
         * The three tables V12 rebuilds: a well-formed row of each differing from a real
         * one only in having no owner, and what is actually lost if the rebuild drops it
         * instead of adopting it.
         *
         * The cost is spelled out per table because "an unowned row is invisible to
         * everybody" is the reasoning that made deleting look free, and it is only true
         * *after* the slice that scopes the table — which is this one.
         */
        val REBUILT = listOf(
            Rebuilt(
                "profile", UNOWNED_PROFILE,
                "reset the body every Maintenance seed is computed from, " +
                    "so the owner's Calorie Budget would be rebuilt from nothing",
            ),
            Rebuilt(
                "reminder_state",
                "INSERT INTO reminder_state (last_seen_on) VALUES ('2026-06-10')",
                "drop the per-episode dedupe, so the owner would be nudged " +
                    "again for an episode they were already nudged about",
            ),
            Rebuilt(
                "push_subscription",
                "INSERT INTO push_subscription (endpoint, p256dh, auth) " +
                    "VALUES ('https://push.example/unowned-device', 'BKey', 'Auth')",
                "silently stop reminding a device that is still subscribed in the " +
                    "browser, so the toggle would read on and nothing arrive",
            ),
        )
    }
}
