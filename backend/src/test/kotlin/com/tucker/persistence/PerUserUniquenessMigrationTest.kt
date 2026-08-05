package com.tucker.persistence

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import java.sql.Connection
import java.sql.SQLException
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * V11 rebuilds `weight_measurement`, `goal` and `weekly_review` so their unique
 * constraints hold per User and `user_id` may not be null (issue #158, ADR 0021).
 *
 * A table rebuild is the migration most able to pass every empty-database check and
 * still be wrong: it copies rows by hand, and getting a column list, a foreign key or
 * a constraint wrong shows up only where there is something to copy. So this migrates
 * to the last pre-multi-user version, fills the schema the way one person's
 * installation fills it, and only then migrates forward — with foreign keys enforced,
 * as Hikari enforces them in the running app.
 */
class PerUserUniquenessMigrationTest {

    @TempDir lateinit var tempDir: Path

    @Test
    fun `a database recorded before multi-user keeps its readings, Goals and reviews`() {
        val db = tempDir.resolve("pre-multi-user.db").toString()

        migrate(db, upTo = "8")
        connect(db).use { seedOnePersonsBodyAndPlan(it) }

        migrate(db, upTo = null)

        connect(db).use { connection ->
            // Ids survive, because they are what an Entry, a chart and a URL refer to.
            assertEquals(
                listOf("1|2026-01-13|91.8|1", "2|2026-01-14|92.4|1"),
                connection.rows("SELECT id, measured_on, weight_kg, user_id FROM weight_measurement ORDER BY id"),
                "every reading should come through the rebuild intact, and still be the owner's",
            )
            assertEquals(
                listOf("1|2026-01-01|96.0|85.0|0.5|1|1"),
                connection.rows(
                    "SELECT id, started_on, start_weight_kg, target_weight_kg, rate_kg_per_week, " +
                        "active, user_id FROM goal ORDER BY id",
                ),
                "the Goal should still be the owner's, and still be the active one",
            )
            assertEquals(
                listOf("1|2026-01-07|92.9|2560.0|2060.0|150.0|1", "2|2026-01-14|92.6|2545.0|2045.0|150.0|1"),
                connection.rows(
                    "SELECT id, reviewed_on, trend_weight_kg, maintenance_kcal, calorie_budget_kcal, " +
                        "protein_floor_g, user_id FROM weekly_review ORDER BY id",
                ),
                "a review is irreversible history, so the rebuild must not round or reorder it",
            )

            // A rebuild is exactly where a foreign key gets quietly dropped: the new
            // table is hand-written, and nothing about the copied values would say so.
            REBUILT_TABLES.forEach { table ->
                assertEquals(
                    "user",
                    connection.foreignKeyTargetOf(table, "user_id"),
                    "`$table.user_id` must still be a foreign key to `user` after the rebuild",
                )
            }
        }
    }

    /**
     * The premise V11's whole safety argument rests on, asserted rather than
     * assumed. Because nothing *references* these three tables, dropping and
     * recreating them strands no child row — which is why the rebuild needs
     * neither `PRAGMA foreign_keys = OFF` nor a non-transactional migration
     * (ADR 0021). That is a fact about the schema's reference graph, not about
     * this migration, so the day a later table points at one of them the premise
     * quietly expires. Here it expires loudly instead.
     */
    @Test
    fun `nothing in the schema references the tables this migration rebuilds`() {
        val db = tempDir.resolve("reference-graph.db").toString()
        migrate(db, upTo = null)

        connect(db).use { connection ->
            val inbound = connection.tableNames()
                .flatMap { table -> connection.foreignKeysOf(table).map { (_, target) -> table to target } }
                .filter { (_, target) -> target in REBUILT_TABLES }

            assertEquals(
                emptyList(),
                inbound,
                "a table now references one of $REBUILT_TABLES, so rebuilding it would " +
                    "strand that table's rows — the next rebuild needs the foreign-key " +
                    "dance V11 was able to skip",
            )
        }
    }

    @Test
    fun `a row nobody owns does not survive the rebuild, and the owned rows beside it do`() {
        val db = tempDir.resolve("with-orphans.db").toString()

        // V9 adopts this history as User 1 — and leaves user_id nullable, so anything
        // the app wrote between then and now carries no owner at all.
        migrate(db, upTo = "8")
        connect(db).use { seedOnePersonsBodyAndPlan(it) }
        migrate(db, upTo = "10")
        connect(db).use { it.execute(UNOWNED_READING) }

        migrate(db, upTo = null)

        connect(db).use { connection ->
            assertEquals(
                listOf("2026-01-13", "2026-01-14"),
                connection.rows("SELECT measured_on FROM weight_measurement ORDER BY measured_on"),
                "the unowned reading is dropped — it was already invisible to every User, " +
                    "including whoever recorded it — and the owned ones are untouched",
            )
        }
    }

    @Test
    fun `a reading, Goal or review recorded with no owner is refused`() {
        val db = tempDir.resolve("not-null.db").toString()
        migrate(db, upTo = null)

        connect(db).use { connection ->
            connection.execute("INSERT INTO user (id, email) VALUES (1, '$MIGRATION_TEST_OWNER')")

            UNOWNED_ROWS.forEach { (table, insert) ->
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

    /**
     * The widening — two Users on the same date — is asserted where it is promised, at
     * the endpoint seam (`CrossUserIsolationTest`). What no endpoint can express is the
     * half that must *survive* it: the old rule, now scoped to one person. Nothing
     * reaches these indexes through the API, because a weigh-in replaces the day's
     * reading and a review is idempotent by date, so if a widened index stopped
     * constraining anything at all, every other test in the project would still pass.
     */
    @Test
    fun `one User still gets one reading a day, one review a date, and one active Goal`() {
        val db = tempDir.resolve("per-user-uniqueness.db").toString()
        migrate(db, upTo = null)

        connect(db).use { connection ->
            connection.execute("INSERT INTO user (id, email) VALUES ($owner, '$MIGRATION_TEST_OWNER')")
            connection.execute("INSERT INTO user (id, email) VALUES ($somebodyElse, 'second@tucker.invalid')")

            DUPLICATED_ROWS.forEach { (what, insert) ->
                connection.execute(insert(owner))
                // The same thing again, for the same person.
                assertFailsWith<SQLException>("a User should not be able to hold two of: $what") {
                    connection.execute(insert(owner))
                }
                // And the identical thing for somebody else, which must still be fine —
                // otherwise the constraint has merely been left global under a new name.
                connection.execute(insert(somebodyElse))
            }
        }
    }

    /** Fill the three tables this migration rebuilds, the way one person's history fills them. */
    private fun seedOnePersonsBodyAndPlan(connection: Connection) = connection.createStatement().use {
        it.executeUpdate("INSERT INTO weight_measurement (id, measured_on, weight_kg) VALUES (1, '2026-01-13', 91.8)")
        it.executeUpdate("INSERT INTO weight_measurement (id, measured_on, weight_kg) VALUES (2, '2026-01-14', 92.4)")
        it.executeUpdate(
            "INSERT INTO goal (id, started_on, start_weight_kg, target_weight_kg, rate_kg_per_week) " +
                "VALUES (1, '2026-01-01', 96.0, 85.0, 0.5)",
        )
        it.executeUpdate(
            "INSERT INTO weekly_review (id, reviewed_on, trend_weight_kg, maintenance_kcal, " +
                "calorie_budget_kcal, protein_floor_g) VALUES (1, '2026-01-07', 92.9, 2560, 2060, 150)",
        )
        it.executeUpdate(
            "INSERT INTO weekly_review (id, reviewed_on, trend_weight_kg, maintenance_kcal, " +
                "calorie_budget_kcal, protein_floor_g) VALUES (2, '2026-01-14', 92.6, 2545, 2045, 150)",
        )
    }

    private companion object {
        val REBUILT_TABLES = listOf("weight_measurement", "goal", "weekly_review")

        /** Two Users, by id — whose row it is, is the only thing these tests vary. */
        const val owner = 1
        const val somebodyElse = 2

        /** What a weigh-in looked like between V9 and V11: recorded, but owned by nobody. */
        const val UNOWNED_READING =
            "INSERT INTO weight_measurement (measured_on, weight_kg) VALUES ('2026-01-15', 92.1)"

        /** The three things a User may hold only one of, as an insert for a given owner. */
        val DUPLICATED_ROWS = listOf<Pair<String, (Int) -> String>>(
            "a reading on 2026-01-14" to { owner ->
                "INSERT INTO weight_measurement (measured_on, weight_kg, user_id) " +
                    "VALUES ('2026-01-14', 92.4, $owner)"
            },
            "a review dated 2026-01-14" to { owner ->
                "INSERT INTO weekly_review (reviewed_on, trend_weight_kg, maintenance_kcal, " +
                    "calorie_budget_kcal, protein_floor_g, user_id) " +
                    "VALUES ('2026-01-14', 92.6, 2545, 2045, 150, $owner)"
            },
            "an active Goal" to { owner ->
                "INSERT INTO goal (started_on, start_weight_kg, target_weight_kg, " +
                    "rate_kg_per_week, active, user_id) VALUES ('2026-01-01', 96.0, 85.0, 0.5, 1, $owner)"
            },
        )

        /** One well-formed row per rebuilt table, differing from a real one only in having no owner. */
        val UNOWNED_ROWS = listOf(
            "weight_measurement" to UNOWNED_READING,
            "goal" to "INSERT INTO goal (started_on, start_weight_kg, target_weight_kg, " +
                "rate_kg_per_week) VALUES ('2026-01-01', 96.0, 85.0, 0.5)",
            "weekly_review" to "INSERT INTO weekly_review (reviewed_on, trend_weight_kg, " +
                "maintenance_kcal, calorie_budget_kcal, protein_floor_g) " +
                "VALUES ('2026-01-14', 92.6, 2545, 2045, 150)",
        )
    }
}
