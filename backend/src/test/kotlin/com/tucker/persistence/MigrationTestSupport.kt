package com.tucker.persistence

import org.flywaydb.core.Flyway
import java.sql.Connection
import java.sql.DriverManager

/**
 * The Flyway/JDBC bootstrap the migration tests share.
 *
 * A migration test is only worth writing when it runs against a database with
 * something *in* it — that is the whole lesson of V9 (a NOT NULL column with a
 * REFERENCES clause is refused only by a table that already has rows) and of V11
 * (a hand-written table rebuild can drop a column, a constraint or a foreign key,
 * and nothing empty will notice). That shape needs the same three things every
 * time: migrate to a chosen version, open a connection with foreign keys enforced
 * the way Hikari enforces them, and inspect the schema. Two tests already need it
 * and slice 5's `profile` / `reminder_state` rebuilds will need it again.
 */

/** The owner the migration tests adopt a pre-multi-user database as. */
const val MIGRATION_TEST_OWNER = "owner-under-test@tucker.invalid"

/**
 * Migrate the SQLite file at [db] to [upTo] (null for the latest), as [owner].
 *
 * The placeholder is escaped exactly as the running backend escapes it
 * ([sqlLiteralSafe]), so these tests exercise the production path rather than a
 * friendlier one of their own.
 */
fun migrate(db: String, upTo: String?, owner: String = MIGRATION_TEST_OWNER) {
    Flyway.configure()
        .dataSource(jdbcUrl(db), null, null)
        .locations("classpath:db/migration")
        .placeholders(mapOf(OWNER_EMAIL_PLACEHOLDER to sqlLiteralSafe(owner)))
        .apply { upTo?.let { target(it) } }
        .load()
        .migrate()
}

/** Open [db] with foreign keys enforced, as the running backend has them. */
fun connect(db: String): Connection = DriverManager.getConnection(jdbcUrl(db))

private fun jdbcUrl(db: String) = "jdbc:sqlite:$db?foreign_keys=true"

/** Run [sql] for its effect. */
fun Connection.execute(sql: String): Int = createStatement().use { it.executeUpdate(sql) }

/**
 * Every row of [sql], each rendered as its columns joined by `|`.
 *
 * A SQL NULL renders as the empty string rather than throwing, because a nullable
 * column — `goal.reached_on`, say — is exactly the kind a rebuild can drop, so the
 * assertions need to be able to state that it came through *as* null.
 */
fun Connection.rows(sql: String): List<String> =
    createStatement().use { statement ->
        statement.executeQuery(sql).use { rows ->
            val columns = rows.metaData.columnCount
            generateSequence {
                if (rows.next()) (1..columns).joinToString("|") { rows.getString(it).orEmpty() } else null
            }.toList()
        }
    }

/** The table `table.column` references, or null when it references nothing. */
fun Connection.foreignKeyTargetOf(table: String, column: String): String? =
    foreignKeysOf(table).firstOrNull { (from, _) -> from == column }?.second

/** Every `from column` → `target table` edge declared by [table]. */
fun Connection.foreignKeysOf(table: String): List<Pair<String, String>> =
    createStatement().use { statement ->
        statement.executeQuery("PRAGMA foreign_key_list($table)").use { rows ->
            generateSequence {
                if (rows.next()) rows.getString("from") to rows.getString("table") else null
            }.toList()
        }
    }

/** Every table in the schema, Flyway's own bookkeeping aside. */
fun Connection.tableNames(): List<String> =
    rows("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .filterNot { it == "flyway_schema_history" }
