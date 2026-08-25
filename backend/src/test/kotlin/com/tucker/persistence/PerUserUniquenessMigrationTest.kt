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
            // Every column, not just the interesting ones: a rebuild copies by hand, and
            // a column left out of the copy reads back as the new table's DEFAULT — which
            // is indistinguishable from the real value unless the fixture avoided it.
            // Ids survive too, because they are what an Entry, a chart and a URL refer to.
            assertEquals(
                listOf(
                    "1|2026-01-13|91.8|2026-01-13 06:02:11|1",
                    "2|2026-01-14|92.4|2026-01-14 06:04:52|1",
                ),
                connection.rows(
                    "SELECT id, measured_on, weight_kg, created_at, user_id " +
                        "FROM weight_measurement ORDER BY id",
                ),
                "every reading should come through the rebuild intact, and still be the owner's",
            )
            assertEquals(
                listOf(
                    "1|2025-09-01|104.0|96.0|0.5|0|2025-09-01 07:00:00|2025-12-20|1",
                    "2|2026-01-01|96.0|85.0|0.5|1|2026-01-01 07:15:00||1",
                ),
                connection.rows(
                    "SELECT id, started_on, start_weight_kg, target_weight_kg, rate_kg_per_week, " +
                        "active, created_at, reached_on, user_id FROM goal ORDER BY id",
                ),
                "both Goals should survive with their own active flag and reached-on latch — " +
                    "losing reached_on re-arms a fork the User already answered (ADR 0008)",
            )
            assertEquals(
                listOf(
                    "1|2026-01-07|92.9|2560.0|2060.0|150.0|2026-01-07 08:00:00|ADAPTIVE|1",
                    "2|2026-01-14|92.6|2545.0|2045.0|150.0|2026-01-14 08:00:00|HELD|1",
                ),
                connection.rows(
                    "SELECT id, reviewed_on, trend_weight_kg, maintenance_kcal, calorie_budget_kcal, " +
                        "protein_floor_g, created_at, maintenance_basis, user_id " +
                        "FROM weekly_review ORDER BY id",
                ),
                "a review is irreversible history, so the rebuild must not round, reorder or " +
                    "rewrite it — dropping maintenance_basis would silently make every one FORMULA_SEED",
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
     * The premise every rebuild in this schema rests on, asserted rather than assumed.
     *
     * A table can be dropped and recreated inside Flyway's transaction, with foreign keys
     * enforced, as long as **everything that references it is rebuilt alongside it** —
     * V11's and V12's six are referenced by nothing, so that condition is met by doing
     * nothing, and V13 met it for `food` by parking and dropping its two children first
     * (ADR 0021, issue #232). Either way it is a fact about the schema's reference graph
     * rather than about any one migration, so the day a later table points at one of them
     * the premise quietly expires. Here it expires loudly instead.
     *
     * Stated as one map rather than two lists because it is one rule: the question to ask
     * of the next rebuild is not whether anything references the table, but whether
     * everything that does can be rebuilt with it.
     */
    @Test
    fun `every rebuilt table is referenced by exactly the tables its rebuild accounts for`() {
        val db = tempDir.resolve("reference-graph.db").toString()
        migrate(db, upTo = null)

        connect(db).use { connection ->
            val inbound = connection.tableNames()
                .flatMap { table -> connection.foreignKeysOf(table).map { (_, target) -> target to table } }
                .groupBy({ (target, _) -> target }, { (_, table) -> table })

            assertEquals(
                REBUILT_TABLE_CHILDREN,
                REBUILT_TABLE_CHILDREN.keys.associateWith { (inbound[it] ?: emptyList()).distinct().sorted() },
                "the tables referencing a rebuilt table have changed. A rebuild drops the " +
                    "table, so every table listed against it must be parked and rebuilt with " +
                    "it the way V13 does for `food` — otherwise that table's rows are " +
                    "stranded, or, where the reference cascades, deleted (ADR 0021)",
            )
        }
    }

    /**
     * The other half of the safety argument: when attribution *would* be a guess,
     * the migration must refuse rather than adopt — and must leave the database
     * exactly as it found it, which is the transactional claim ADR 0021 rests on.
     *
     * Reached here with two Users and an unowned row, the state slice 5 onward could
     * produce. Nothing asserts this from the happy path: a non-transactional V11
     * would pass every other test in this class while leaving a half-rebuilt
     * database behind.
     */
    @Test
    fun `an unowned row nobody can be attributed refuses the migration, and rolls it back`() {
        val db = tempDir.resolve("ambiguous.db").toString()
        migrate(db, upTo = "10")

        connect(db).use { connection ->
            connection.seedTwoUsers()
            connection.execute(UNOWNED_READING)
        }

        assertFailsWith<FlywayException>(
            "with two Users, an unowned row cannot be attributed — guessing is worse than refusing",
        ) { migrate(db, upTo = null) }

        connect(db).use { connection ->
            assertEquals(
                emptyList(),
                connection.rows("SELECT version FROM flyway_schema_history WHERE version = '11'"),
                "the failed migration must not be recorded as applied",
            )
            // Rolled back *whole*, not merely unrecorded: the database is still the V10
            // one and the next boot can retry. A half-migrated state is precisely what
            // ADR 0021 says cannot happen here.
            //
            // On `weight_measurement_new`, because it is the only artefact that
            // discriminates: V11 fails on the INSERT that fills the new table, so the DROP,
            // the RENAME and the new index are never reached whether or not anything rolls
            // back. The empty shell created just before that INSERT is what only a rollback
            // removes.
            assertEquals(
                emptyList(),
                connection.rows(
                    "SELECT name FROM sqlite_master WHERE type = 'table' " +
                        "AND name = 'weight_measurement_new'",
                ),
                "the half-built table must be gone — it is the one thing a " +
                    "non-transactional migration would leave behind at the point V11 fails",
            )
            assertEquals(
                listOf("2026-01-15"),
                connection.rows("SELECT measured_on FROM weight_measurement"),
                "and the row it could not attribute is still there for a human to resolve",
            )
        }
    }

    /**
     * The rows written between V9 and here carry no owner, and this slice is what
     * scopes the repositories reading them — so until it runs they are not stray
     * detritus, they are the User's live readings, Goal and reviews. They must be
     * adopted, not discarded.
     */
    @Test
    fun `rows written before the owner column was filled in are adopted, not discarded`() {
        val db = tempDir.resolve("unowned.db").toString()

        // V9 adopts the pre-multi-user history as User 1 and leaves user_id nullable,
        // so everything the app wrote after it carries no owner at all.
        migrate(db, upTo = "8")
        connect(db).use { seedOnePersonsBodyAndPlan(it) }
        migrate(db, upTo = "10")
        connect(db).use { connection -> UNOWNED_AFTER_V9.forEach(connection::execute) }

        migrate(db, upTo = null)

        connect(db).use { connection ->
            assertEquals(
                listOf("2026-01-13", "2026-01-14", "2026-01-15"),
                connection.rows("SELECT measured_on FROM weight_measurement ORDER BY measured_on"),
                "the unowned reading is the owner's own, recorded before the column " +
                    "was filled in — deleting it would lose a morning off the scale for good",
            )
            assertEquals(
                listOf("2026-02-01", "2026-01-01", "2025-09-01"),
                connection.rows("SELECT started_on FROM goal ORDER BY started_on DESC"),
                "an unowned Goal is adopted rather than dropped — dropping one would erase a " +
                    "decision its owner made, and dropping an active one would put them into " +
                    "Maintenance Mode having decided nothing (ADR 0008)",
            )
            assertEquals(
                listOf("2026-01-07", "2026-01-14", "2026-01-21"),
                connection.rows("SELECT reviewed_on FROM weekly_review ORDER BY reviewed_on"),
                "a Weekly Review is irreversible history, so an unowned one is adopted too",
            )
            REBUILT_TABLES.forEach { table ->
                assertEquals(
                    emptyList(),
                    connection.rows("SELECT id FROM $table WHERE user_id IS NOT $OWNER_ID"),
                    "everything in `$table` ends up belonging to the one User there was to adopt it",
                )
            }
        }
    }

    @Test
    fun `a reading, Goal or review recorded with no owner is refused`() {
        val db = tempDir.resolve("not-null.db").toString()
        migrate(db, upTo = null)

        connect(db).use { connection ->
            connection.seedOwner()

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
     * reaches these indexes through the API, because a reading replaces the day's
     * earlier one and a review is idempotent by date, so if a widened index stopped
     * constraining anything at all, every other test in the project would still pass.
     */
    @Test
    fun `one User still gets one reading a day, one review a date, and one active Goal`() {
        val db = tempDir.resolve("per-user-uniqueness.db").toString()
        migrate(db, upTo = null)

        connect(db).use { connection ->
            connection.seedTwoUsers()

            DUPLICATED_ROWS.forEach { (what, insert) ->
                connection.execute(insert(OWNER_ID))
                // The same thing again, for the same person.
                assertFailsWith<SQLException>("a User should not be able to hold two of: $what") {
                    connection.execute(insert(OWNER_ID))
                }
                // And the identical thing for somebody else, which must still be fine —
                // otherwise the constraint has merely been left global under a new name.
                connection.execute(insert(SECOND_USER_ID))
            }
        }
    }

    /**
     * Fill the three tables this migration rebuilds, the way one person's history
     * fills them.
     *
     * Every column that could be dropped from the rebuild *silently* is seeded away
     * from its schema default, and asserted above. Seeded at the default instead —
     * which is what a casual fixture does — a dropped column reads back as the value
     * the new table's DEFAULT supplies, so the test passes and production loses the
     * data. `maintenance_basis` is the worst of them: at the default, dropping it
     * collapses every historical review to FORMULA_SEED with nothing to show for it.
     */
    private fun seedOnePersonsBodyAndPlan(connection: Connection) = connection.createStatement().use {
        it.executeUpdate(
            "INSERT INTO weight_measurement (id, measured_on, weight_kg, created_at) " +
                "VALUES (1, '2026-01-13', 91.8, '2026-01-13 06:02:11')",
        )
        it.executeUpdate(
            "INSERT INTO weight_measurement (id, measured_on, weight_kg, created_at) " +
                "VALUES (2, '2026-01-14', 92.4, '2026-01-14 06:04:52')",
        )
        // Reached and retired (active = 0, reached_on set), so neither field reads as
        // its default — and a second, live Goal beside it, so `active` is discriminating.
        it.executeUpdate(
            "INSERT INTO goal (id, started_on, start_weight_kg, target_weight_kg, rate_kg_per_week, " +
                "active, created_at, reached_on) " +
                "VALUES (1, '2025-09-01', 104.0, 96.0, 0.5, 0, '2025-09-01 07:00:00', '2025-12-20')",
        )
        it.executeUpdate(
            "INSERT INTO goal (id, started_on, start_weight_kg, target_weight_kg, rate_kg_per_week, " +
                "active, created_at) VALUES (2, '2026-01-01', 96.0, 85.0, 0.5, 1, '2026-01-01 07:15:00')",
        )
        // ADAPTIVE and HELD: the two bases a dropped column would rewrite to FORMULA_SEED.
        it.executeUpdate(
            "INSERT INTO weekly_review (id, reviewed_on, trend_weight_kg, maintenance_kcal, " +
                "calorie_budget_kcal, protein_floor_g, created_at, maintenance_basis) " +
                "VALUES (1, '2026-01-07', 92.9, 2560, 2060, 150, '2026-01-07 08:00:00', 'ADAPTIVE')",
        )
        it.executeUpdate(
            "INSERT INTO weekly_review (id, reviewed_on, trend_weight_kg, maintenance_kcal, " +
                "calorie_budget_kcal, protein_floor_g, created_at, maintenance_basis) " +
                "VALUES (2, '2026-01-14', 92.6, 2545, 2045, 150, '2026-01-14 08:00:00', 'HELD')",
        )
    }

    private companion object {
        val REBUILT_TABLES = listOf("weight_measurement", "goal", "weekly_review")

        /**
         * Every table this schema has rebuilt, against the tables that reference it — the
         * rows a rebuild would strand if it dropped the table without accounting for them.
         *
         * V11's three, V12's `profile`, `reminder_state` and `push_subscription`
         * (issue #159), and V13's `food`, `entry` and `recipe_ingredient` (issue #232 —
         * the last of those is rebuilt for `food`'s benefit rather than its own, which
         * makes it the one nobody would think to list). Guarded together, because a guard
         * that stopped at the tables already rebuilt would let the next slice inherit the
         * premise unchecked — which is how slice 5 found this list waiting for it. `food`
         * is the only one with children, and the only one whose migration had to do
         * anything about them.
         */
        val REBUILT_TABLE_CHILDREN: Map<String, List<String>> =
            (REBUILT_TABLES + listOf("profile", "reminder_state", "push_subscription", "entry", "recipe_ingredient"))
                .associateWith { emptyList<String>() } +
                mapOf("food" to listOf("entry", "recipe_ingredient"))

        /** What a reading looked like between V9 and V11: recorded, but owned by nobody. */
        const val UNOWNED_READING =
            "INSERT INTO weight_measurement (measured_on, weight_kg) VALUES ('2026-01-15', 92.1)"

        /**
         * A week of ordinary use on a V10 database: real rows, written by repositories
         * that did not yet stamp an owner. Dates and the inactive flag are chosen not to
         * collide with the seeded history under the *global* constraints still in force
         * at V10 — the collision would be the constraint doing its job, not the bug.
         */
        val UNOWNED_AFTER_V9 = listOf(
            UNOWNED_READING,
            "INSERT INTO goal (started_on, start_weight_kg, target_weight_kg, rate_kg_per_week, active) " +
                "VALUES ('2026-02-01', 92.0, 88.0, 0.25, 0)",
            "INSERT INTO weekly_review (reviewed_on, trend_weight_kg, maintenance_kcal, " +
                "calorie_budget_kcal, protein_floor_g) VALUES ('2026-01-21', 92.1, 2530, 2030, 150)",
        )

        /** The three things a User may hold only one of, as an insert for a given owner. */
        val DUPLICATED_ROWS = listOf<Pair<String, (Int) -> String>>(
            "a reading on 2026-01-14" to { user ->
                "INSERT INTO weight_measurement (measured_on, weight_kg, user_id) " +
                    "VALUES ('2026-01-14', 92.4, $user)"
            },
            "a review dated 2026-01-14" to { user ->
                "INSERT INTO weekly_review (reviewed_on, trend_weight_kg, maintenance_kcal, " +
                    "maintenance_basis, calorie_budget_kcal, protein_floor_g, user_id) " +
                    "VALUES ('2026-01-14', 92.6, 2545, 'ADAPTIVE', 2045, 150, $user)"
            },
            "an active Goal" to { user ->
                "INSERT INTO goal (started_on, start_weight_kg, target_weight_kg, " +
                    "rate_kg_per_week, active, user_id) VALUES ('2026-01-01', 96.0, 85.0, 0.5, 1, $user)"
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
