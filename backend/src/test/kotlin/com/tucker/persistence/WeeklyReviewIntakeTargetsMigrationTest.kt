package com.tucker.persistence

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import java.sql.Connection
import java.sql.SQLException
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * V15 rebuilds `weekly_review` so its Intake Targets may be absent (issue #249,
 * ADR 0024): a review run with Calorie Tracking off records a Trend Weight and no
 * Maintenance, Calorie Budget or Protein Floor.
 *
 * A rebuild copies rows by hand, so it can drop a column, a constraint or a foreign
 * key and pass every check an empty database can make. This one migrates to the
 * version before it, fills the table the way a tracking User's history fills it,
 * and only then migrates forward — with foreign keys enforced, as Hikari enforces
 * them in the running app.
 */
class WeeklyReviewIntakeTargetsMigrationTest {

    @TempDir lateinit var tempDir: Path

    @Test
    fun `every review written before the rebuild keeps its Intake Targets`() {
        val db = tempDir.resolve("pre-optional-targets.db").toString()

        migrate(db, upTo = "14")
        connect(db).use { connection ->
            connection.seedOwner()
            connection.seedTrackedHistory()
        }

        migrate(db, upTo = null)

        connect(db).use { connection ->
            // Every column, not just the relaxed ones. A relaxation is where a value
            // most easily becomes a null nobody notices: the row still reads back, the
            // ledger still renders, and the only trace is an em-dash where a Budget was.
            assertEquals(
                listOf(
                    "1|2026-01-07|92.9|2560.0|2060.0|150.0|2026-01-07 08:00:00|ADAPTIVE|1",
                    "2|2026-01-14|92.6|2545.0|2045.0|150.0|2026-01-14 08:00:00|HELD|1",
                ),
                connection.rows(REVIEW_COLUMNS),
                "a review is irreversible history: the rebuild must carry every figure " +
                    "across, and every one of them must still be present",
            )

            assertEquals(
                "user",
                connection.foreignKeyTargetOf("weekly_review", "user_id"),
                "`weekly_review.user_id` must still be a foreign key to `user` after the rebuild",
            )
        }
    }

    @Test
    fun `the four target columns become nullable, and the review's own facts do not`() {
        val db = tempDir.resolve("relaxed-columns.db").toString()
        migrate(db, upTo = null)

        connect(db).use { connection ->
            RELAXED_COLUMNS.forEach { column ->
                assertTrue(
                    connection.isNullable("weekly_review", column),
                    "`weekly_review.$column` must be nullable — a review run with Calorie " +
                        "Tracking off has no $column to record",
                )
            }
            // The review's other job is not optional, and neither is whose review it is.
            listOf("reviewed_on", "trend_weight_kg", "user_id").forEach { column ->
                assertFalse(
                    connection.isNullable("weekly_review", column),
                    "`weekly_review.$column` must stay NOT NULL — every review has one",
                )
            }
        }
    }

    @Test
    fun `a review carries all four targets or none, never some`() {
        val db = tempDir.resolve("targets-are-atomic.db").toString()
        migrate(db, upTo = null)

        connect(db).use { connection ->
            connection.seedOwner()

            connection.execute(reviewInsert("2026-02-04", targets = null))
            connection.execute(reviewInsert("2026-02-11", targets = "2545, 'HELD', 2045, 150"))

            // The domain has no meaning for a Floor with no Budget or a Budget with no
            // basis, which is why the four are one value object rather than four
            // nullable fields. The schema says the same thing, so a hand-written row
            // cannot introduce a shape every reader would then have to tolerate.
            PARTIAL_TARGETS.forEach { (what, values) ->
                assertFailsWith<SQLException>("a review should not be able to carry $what") {
                    connection.execute(reviewInsert("2026-02-18", targets = values))
                }
            }
        }
    }

    /** Two reviews from a tracking User's history, each column seeded away from any default. */
    private fun Connection.seedTrackedHistory() {
        execute(
            "INSERT INTO weekly_review (id, reviewed_on, trend_weight_kg, maintenance_kcal, " +
                "calorie_budget_kcal, protein_floor_g, created_at, maintenance_basis, user_id) " +
                "VALUES (1, '2026-01-07', 92.9, 2560, 2060, 150, '2026-01-07 08:00:00', 'ADAPTIVE', $OWNER_ID)",
        )
        execute(
            "INSERT INTO weekly_review (id, reviewed_on, trend_weight_kg, maintenance_kcal, " +
                "calorie_budget_kcal, protein_floor_g, created_at, maintenance_basis, user_id) " +
                "VALUES (2, '2026-01-14', 92.6, 2545, 2045, 150, '2026-01-14 08:00:00', 'HELD', $OWNER_ID)",
        )
    }

    /** A review on [reviewedOn] whose four target columns are [targets], or all null. */
    private fun reviewInsert(reviewedOn: String, targets: String?): String =
        "INSERT INTO weekly_review (reviewed_on, trend_weight_kg, maintenance_kcal, " +
            "maintenance_basis, calorie_budget_kcal, protein_floor_g, user_id) " +
            "VALUES ('$reviewedOn', 92.6, ${targets ?: "NULL, NULL, NULL, NULL"}, $OWNER_ID)"

    private companion object {
        const val REVIEW_COLUMNS =
            "SELECT id, reviewed_on, trend_weight_kg, maintenance_kcal, calorie_budget_kcal, " +
                "protein_floor_g, created_at, maintenance_basis, user_id " +
                "FROM weekly_review ORDER BY id"

        val RELAXED_COLUMNS =
            listOf("maintenance_kcal", "maintenance_basis", "calorie_budget_kcal", "protein_floor_g")

        /** One malformed row per column that could be left behind on its own. */
        val PARTIAL_TARGETS = listOf(
            "a Protein Floor with no Calorie Budget" to "NULL, NULL, NULL, 150",
            "a Calorie Budget with no Maintenance" to "NULL, NULL, 2045, 150",
            "a Maintenance with no basis" to "2545, NULL, 2045, 150",
            "a Maintenance basis with nothing to be the basis of" to "NULL, 'HELD', NULL, NULL",
        )
    }
}
