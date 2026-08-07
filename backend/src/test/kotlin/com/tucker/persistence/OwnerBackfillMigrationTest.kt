package com.tucker.persistence

import org.flywaydb.core.Flyway
import org.flywaydb.core.api.FlywayException
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import java.sql.Connection
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * V9 has to adopt a database that already exists — the production one, holding
 * years of a single person's history — and attribute every row in it to them
 * (issue #156, ADR 0021).
 *
 * A blank-slate test cannot show that. Worse, it cannot even show that V9
 * *applies*: SQLite refuses to add a NOT NULL column carrying a REFERENCES
 * clause **only when the table already has rows**, so a migration that is broken
 * for production passes against every empty database in the project. This test
 * therefore migrates to the last pre-multi-user version, fills the schema the way
 * a real installation is filled, and only then migrates forward — with foreign
 * keys enforced, as Hikari enforces them in the running app.
 */
class OwnerBackfillMigrationTest {

    @TempDir lateinit var tempDir: Path

    private val owner = MIGRATION_TEST_OWNER

    @Test
    fun `migrating a database recorded before multi-user attributes every row to the owner`() {
        val db = tempDir.resolve("pre-multi-user.db").toString()

        migrate(db, upTo = "8")
        connect(db).use { connection ->
            assertTrue(
                foreignKeysEnforced(connection),
                "the seeded database must enforce foreign keys, or this test cannot " +
                    "observe the one failure it exists to catch",
            )
            seedSinglePersonHistory(connection)
        }

        migrate(db, upTo = null)

        connect(db).use { connection ->
            val ownerId = connection.queryOne("SELECT id FROM user WHERE email = '$owner'")
            assertEquals(1, ownerId, "V9 adopts the existing rows as User 1")
            assertEquals(
                1,
                connection.queryOne("SELECT count(*) FROM user"),
                "adopting a database creates the owner and nobody else",
            )

            OWNED_TABLES.forEach { table ->
                assertEquals(
                    0,
                    connection.queryOne("SELECT count(*) FROM $table WHERE user_id IS NOT 1"),
                    "every pre-existing row in `$table` should now belong to the owner",
                )
                assertTrue(
                    connection.queryOne("SELECT count(*) FROM $table") > 0,
                    "precondition: `$table` was seeded, so the check above means something",
                )
                // The backfilled *values* say nothing about the constraint: strip
                // `REFERENCES user (id)` off the ALTERs and every assertion above still
                // passes against a bare integer column that would happily name a User
                // who does not exist.
                assertEquals(
                    "user",
                    connection.foreignKeyTargetOf(table, "user_id"),
                    "`$table.user_id` must be a foreign key to `user`, not a loose integer",
                )
            }

            // The ingredient lines of the seeded Recipe are owned through their Recipe's
            // Food row, not by a column of their own (ADR 0021) — so they are still here,
            // and still unowned, on purpose.
            assertEquals(
                1,
                connection.queryOne("SELECT count(*) FROM recipe_ingredient"),
                "a Recipe's ingredient lines survive the migration untouched",
            )
            assertFalse(
                connection.columnNames("recipe_ingredient").contains("user_id"),
                "recipe_ingredient is owned through its Recipe, so it carries no owner of its own",
            )
        }
    }

    @Test
    fun `migrating an empty database provisions no owner`() {
        val db = tempDir.resolve("fresh.db").toString()

        migrate(db, upTo = null)

        connect(db).use { connection ->
            assertEquals(
                0,
                connection.queryOne("SELECT count(*) FROM user"),
                "a fresh install has nothing to adopt, so the first person to open " +
                    "Tucker is provisioned by the ordinary just-in-time path instead " +
                    "of inheriting a phantom owner",
            )
        }
    }

    @Test
    fun `migrating without an owner named refuses to run`() {
        val db = tempDir.resolve("unnamed.db").toString()

        val refusal = assertFailsWith<FlywayException> {
            Flyway.configure()
                .dataSource("jdbc:sqlite:$db?foreign_keys=true", null, null)
                .locations("classpath:db/migration")
                .load()
                .migrate()
        }

        assertTrue(
            refusal.message.orEmpty().contains("ownerEmail"),
            "an operator who forgets TUCKER_OWNER_EMAIL must be told which value is " +
                "missing, not have `\${ownerEmail}` stored as somebody's email address — " +
                "was: ${refusal.message}",
        )
    }

    @Test
    fun `an owner whose address contains an apostrophe is adopted, not a syntax error`() {
        // Flyway substitutes placeholders as plain text, so the address lands inside a
        // single-quoted literal exactly as written. An apostrophe is legal in a local
        // part, and an unescaped one closes that literal early — turning the rest of the
        // address into syntax and failing the migration on the one deploy that has a
        // database worth adopting.
        val awkward = "o'brien@tucker.invalid"
        val db = tempDir.resolve("apostrophe.db").toString()

        migrate(db, upTo = "8", owner = awkward)
        connect(db).use { it.createStatement().use { s -> s.executeUpdate(SEED_ONE_FOOD) } }

        migrate(db, upTo = null, owner = awkward)

        connect(db).use { connection ->
            assertEquals(
                awkward,
                connection.queryString("SELECT email FROM user WHERE id = 1"),
                "the owner's address should be stored exactly as Access asserts it",
            )
            assertEquals(
                0,
                connection.queryOne("SELECT count(*) FROM food WHERE user_id IS NOT 1"),
                "and their existing rows should still have been adopted",
            )
        }
    }

    private fun foreignKeysEnforced(connection: Connection): Boolean =
        connection.queryOne("PRAGMA foreign_keys") == 1

    /** Fill every owned table the way one person's installation fills it. */
    private fun seedSinglePersonHistory(connection: Connection) = connection.createStatement().use {
        it.executeUpdate(
            "INSERT INTO food (id, name, calories_per_100g, protein_per_100g) " +
                "VALUES (1, 'Rolled oats', 379, 13.2)",
        )
        it.executeUpdate(
            "INSERT INTO food (id, name, kind, calories_per_100g, protein_per_100g, cooked_weight_g) " +
                "VALUES (2, 'Sunday bolognese', 'RECIPE', 118, 9.4, 1450)",
        )
        it.executeUpdate(
            "INSERT INTO recipe_ingredient (recipe_id, ingredient_food_id, grams) VALUES (2, 1, 300)",
        )
        it.executeUpdate(
            "INSERT INTO entry (logged_on, kind, food_id, grams, calories, protein) " +
                "VALUES ('2026-01-14', 'WEIGHED', 1, 80, 303.2, 10.6)",
        )
        it.executeUpdate(
            "INSERT INTO entry (logged_on, kind, label, calories) " +
                "VALUES ('2026-01-14', 'ESTIMATED', 'Thai takeaway', 700)",
        )
        it.executeUpdate(
            "INSERT INTO weight_measurement (measured_on, weight_kg) VALUES ('2026-01-14', 92.4)",
        )
        it.executeUpdate(
            "INSERT INTO goal (started_on, start_weight_kg, target_weight_kg, rate_kg_per_week) " +
                "VALUES ('2026-01-01', 96.0, 85.0, 0.5)",
        )
        it.executeUpdate(
            "INSERT INTO weekly_review (reviewed_on, trend_weight_kg, maintenance_kcal, " +
                "calorie_budget_kcal, protein_floor_g) VALUES ('2026-01-14', 92.6, 2560, 2060, 150)",
        )
        it.executeUpdate(
            "INSERT INTO profile (id, sex, birth_date, height_cm) VALUES (1, 'MALE', '1986-05-22', 180)",
        )
        it.executeUpdate(
            "INSERT INTO push_subscription (endpoint, p256dh, auth) " +
                "VALUES ('https://push.example/abc', 'a-key', 'an-auth')",
        )
        it.executeUpdate("INSERT INTO reminder_state (id, last_seen_on) VALUES (1, '2026-01-14')")
    }

    private fun Connection.queryString(sql: String): String? =
        createStatement().use { it.executeQuery(sql).use { rows -> rows.next(); rows.getString(1) } }

    private fun Connection.queryOne(sql: String): Int =
        createStatement().use { it.executeQuery(sql).use { rows -> rows.next(); rows.getInt(1) } }

    private fun Connection.columnNames(table: String): List<String> =
        createStatement().use { statement ->
            statement.executeQuery("PRAGMA table_info($table)").use { rows ->
                generateSequence { if (rows.next()) rows.getString("name") else null }.toList()
            }
        }

    private companion object {
        /** Enough pre-existing history for V9 to find something worth adopting. */
        const val SEED_ONE_FOOD =
            "INSERT INTO food (name, calories_per_100g, protein_per_100g) VALUES ('Oats', 379, 13.2)"

        val OWNED_TABLES = listOf(
            "food", "entry", "weight_measurement", "goal",
            "weekly_review", "profile", "push_subscription", "reminder_state",
        )
    }
}
