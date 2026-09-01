package com.tucker.persistence

import org.flywaydb.core.Flyway
import java.nio.file.Path
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
 * inspect the schema. Every migration test in this package needs it.
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
    seedSecondUser()
}

/**
 * Insert somebody else beside an owner who is already there — which is how a database
 * that V9 adopted acquires its second User, and the state in which an unowned row can no
 * longer be attributed to anyone.
 */
fun Connection.seedSecondUser() {
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

/**
 * A database in [dir] migrated all the way forward and open — what a test asserting
 * about the schema a fresh install ends up with needs, in one line.
 */
fun migratedDatabase(dir: Path, name: String): Connection =
    dir.resolve(name).toString().also { migrate(it, upTo = null) }.let { connect(it) }

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

/**
 * What [table] does to its own row when the row `table.column` references is deleted —
 * `CASCADE`, `NO ACTION`, and so on.
 *
 * Worth asking separately from [foreignKeysOf] because a rebuild can preserve every edge
 * in the graph and still change what the edges *do*: an `ON DELETE CASCADE` dropped from a
 * hand-written table copy leaves the foreign key looking correct while the delete it
 * governs starts failing, and one added where there was none turns a refusal into a
 * silent cascade.
 */
fun Connection.onDeleteActionOf(table: String, column: String): String? =
    foreignKeyList(table).firstOrNull { it.from == column }?.onDelete

/** Every `from column` → `target table` edge declared by [table]. */
fun Connection.foreignKeysOf(table: String): List<Pair<String, String>> =
    foreignKeyList(table).map { it.from to it.target }

/** One row of `PRAGMA foreign_key_list` — an edge, and what it does when the parent goes. */
private data class ForeignKey(val from: String, val target: String, val onDelete: String)

/** Every foreign key [table] declares, read once for whichever facet the caller wants. */
private fun Connection.foreignKeyList(table: String): List<ForeignKey> =
    createStatement().use { statement ->
        statement.executeQuery("PRAGMA foreign_key_list($table)").use { rows ->
            generateSequence {
                if (rows.next()) {
                    ForeignKey(
                        from = rows.getString("from"),
                        target = rows.getString("table"),
                        onDelete = rows.getString("on_delete"),
                    )
                } else {
                    null
                }
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
