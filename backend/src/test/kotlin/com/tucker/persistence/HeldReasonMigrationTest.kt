package com.tucker.persistence

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import kotlin.test.assertEquals

/**
 * V19 adds `weekly_review.held_reason` (issue #348, ADR 0031).
 *
 * The same shape as [CalorieTrackingMigrationTest], for the same reason: the one thing
 * an `ADD COLUMN` does that an empty database cannot show is what it leaves in the rows
 * already there. Here that is the decision itself — ADR 0031 rejects backfilling a
 * reason onto reviews computed under a rule that did not record one, because the window
 * each was derived from is gone. Null is the honest spelling, and this is what says so.
 */
class HeldReasonMigrationTest {

    @TempDir lateinit var tempDir: Path

    @Test
    fun `a held review written before the column existed keeps its figures and gains no reason`() {
        val db = tempDir.resolve("pre-held-reason.db").toString()

        migrate(db, upTo = "18")
        connect(db).use { connection ->
            connection.seedOwner()
            // A held week and an adaptive one, so the assertion covers both the basis
            // that may carry a reason and one that never can.
            connection.execute(
                "INSERT INTO weekly_review (id, reviewed_on, trend_weight_kg, maintenance_kcal, " +
                    "calorie_budget_kcal, protein_floor_g, maintenance_basis, user_id) VALUES " +
                    "(1, '2026-01-07', 92.9, 2560.0, 2060.0, 150.0, 'ADAPTIVE', $OWNER_ID)",
            )
            connection.execute(
                "INSERT INTO weekly_review (id, reviewed_on, trend_weight_kg, maintenance_kcal, " +
                    "calorie_budget_kcal, protein_floor_g, maintenance_basis, user_id) VALUES " +
                    "(2, '2026-01-14', 92.6, 2545.0, 2045.0, 150.0, 'HELD', $OWNER_ID)",
            )
        }

        migrate(db, upTo = null)

        connect(db).use { connection ->
            assertEquals(
                listOf(
                    "1|2026-01-07|92.9|2560.0|2060.0|150.0|ADAPTIVE|",
                    "2|2026-01-14|92.6|2545.0|2045.0|150.0|HELD|",
                ),
                connection.rows(
                    "SELECT id, reviewed_on, trend_weight_kg, maintenance_kcal, " +
                        "calorie_budget_kcal, protein_floor_g, maintenance_basis, " +
                        "COALESCE(held_reason, '') FROM weekly_review ORDER BY id",
                ),
                "a review is irreversible history: every figure must come through, and the " +
                    "held one must gain no reason — the window it was derived from is gone, " +
                    "so any reason written here would be invented",
            )
        }
    }
}
