package com.tucker.persistence

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import kotlin.test.assertEquals

/**
 * V25 gives a route change the parts it is split into (ADR 0038). A row stored before
 * them can never be split, and every route change must carry them, so it goes.
 */
class MetricEventSplitMigrationTest {

    @TempDir lateinit var tempDir: Path

    @Test
    fun `a route change stored before the split is removed`() {
        val db = tempDir.resolve("pre-split.db").toString()

        migrate(db, upTo = "24")
        connect(db).use { connection ->
            connection.execute(
                "INSERT INTO metric_event (kind, route, value_ms, layout, installed, app_version, recorded_at) " +
                    "VALUES ('route-change', '/review', 420, 'phone', 0, '0.1.42', '2026-10-21T08:00:00Z')",
            )
        }

        migrate(db, upTo = null)

        connect(db).use { connection ->
            assertEquals(listOf("0"), connection.rows("SELECT count(*) FROM metric_event"))
        }
    }
}
