package com.tucker.persistence

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import kotlin.test.assertEquals

/**
 * V27: a metric's app version is a semantic version (ADR 0038). A row stored under one
 * that is not — an unstamped build's `dev` — has no place in release order, so it goes.
 */
class MetricEventVersionMigrationTest {

    @TempDir lateinit var tempDir: Path

    @Test
    fun `removes a metric stored under a version that is not a semantic version, and keeps the rest`() {
        val db = tempDir.resolve("pre-semver.db").toString()

        migrate(db, upTo = "26")
        connect(db).use { connection ->
            listOf("dev", "0.1.42", "0.2.0-rc.1+b5").forEach { connection.execute(insert(it)) }
        }

        migrate(db, upTo = null)

        connect(db).use { connection ->
            assertEquals(
                listOf("0.1.42", "0.2.0-rc.1+b5"),
                connection.rows("SELECT app_version FROM metric_event ORDER BY id"),
            )
        }
    }

    private fun insert(version: String) =
        "INSERT INTO metric_event (kind, route, value_ms, api_ms, server_ms, first_visit, layout, " +
            "installed, engine, os, app_version, recorded_at) VALUES ('route-change', '/review', 420, " +
            "300, 100, 0, 'phone', 0, 'webkit', 'ios', '$version', '2026-10-21T08:00:00Z')"
}
