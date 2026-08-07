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
 * and nothing empty will notice). That shape needs the same four things every
 * time: migrate to a chosen version, open a connection with foreign keys enforced
 * the way Hikari enforces them, seed the Users whose ownership is under test, and
 * inspect the schema. Three tests need it now — V9's backfill, V11's rebuilds and
 * V12's — and issue #232 will bring a fourth.
 */

/** The owner the migration tests adopt a pre-multi-user database as. */
const val MIGRATION_TEST_OWNER = "owner-under-test@tucker.invalid"

/** Somebody else — the second User an ownership test needs to be about anybody at all. */
const val MIGRATION_TEST_SECOND_USER = "second@tucker.invalid"

/**
 * The two Users, by id. Whose row it is, is the only thing the ownership tests vary, so
 * these read better as names than as the bare 1 and 2 threaded through raw SQL.
 */
const val OWNER_ID = 1
const val SECOND_USER_ID = 2

/** Insert the owner — the only User a database can hold while a rebuild may still adopt rows. */
fun Connection.seedOwner() {
    execute("INSERT INTO user (id, email) VALUES ($OWNER_ID, '$MIGRATION_TEST_OWNER')")
}

/**
 * Insert both Users. An ownership test needs two to be about anyone, and an adoption
 * guard needs two to be *refused* — which is the case that matters most, since the only
 * alternative to refusing is guessing whose data it is.
 */
fun Connection.seedTwoUsers() {
    seedOwner()
    execute("INSERT INTO user (id, email) VALUES ($SECOND_USER_ID, '$MIGRATION_TEST_SECOND_USER')")
}

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

/** Whether `table.column` accepts NULL, read off the schema rather than inferred. */
fun Connection.isNullable(table: String, column: String): Boolean =
    createStatement().use { statement ->
        statement.executeQuery("PRAGMA table_info($table)").use { rows ->
            generateSequence { if (rows.next()) rows.getString("name") to rows.getInt("notnull") else null }
                .first { (name, _) -> name == column }
                .second == 0
        }
    }

/** Every table in the schema, Flyway's own bookkeeping aside. */
fun Connection.tableNames(): List<String> =
    rows("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .filterNot { it == "flyway_schema_history" }
