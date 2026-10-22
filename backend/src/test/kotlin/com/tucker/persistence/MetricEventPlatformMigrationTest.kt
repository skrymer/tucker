package com.tucker.persistence

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import java.sql.SQLException
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/**
 * V26 stores the engine and OS a metric was measured in (ADR 0038). A row stored before
 * them was never classified, and every metric must name both, so it goes.
 */
class MetricEventPlatformMigrationTest {

    @TempDir lateinit var tempDir: Path

    @Test
    fun `a metric stored before the engine and OS is removed`() {
        val db = tempDir.resolve("pre-platform.db").toString()

        migrate(db, upTo = "25")
        connect(db).use { connection ->
            connection.execute(
                "INSERT INTO metric_event (kind, route, value_ms, api_ms, server_ms, first_visit, layout, " +
                    "installed, app_version, recorded_at) VALUES ('route-change', '/review', 420, 300, 100, 0, " +
                    "'phone', 0, '0.1.42', '2026-10-21T08:00:00Z')",
            )
        }

        migrate(db, upTo = null)

        connect(db).use { connection ->
            assertEquals(listOf("0"), connection.rows("SELECT count(*) FROM metric_event"))
        }
    }

    /** As V24 guards `layout`, at the database as well as in the domain. */
    @Test
    fun `refuses a stored engine Tucker does not tell apart`() {
        migratedDatabase(tempDir, "engine.db").use { connection ->
            assertFailsWith<SQLException> { connection.execute(insert(engine = "trident")) }
        }
    }

    @Test
    fun `refuses a stored OS Tucker does not tell apart`() {
        migratedDatabase(tempDir, "os.db").use { connection ->
            assertFailsWith<SQLException> { connection.execute(insert(os = "beos")) }
        }
    }

    private fun insert(engine: String = "webkit", os: String = "ios") =
        "INSERT INTO metric_event (kind, route, value_ms, api_ms, server_ms, first_visit, layout, " +
            "installed, engine, os, app_version, recorded_at) VALUES ('route-change', '/review', 420, " +
            "300, 100, 0, 'phone', 0, '$engine', '$os', '0.1.42', '2026-10-21T08:00:00Z')"
}
