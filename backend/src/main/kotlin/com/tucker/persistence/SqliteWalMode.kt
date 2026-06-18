package com.tucker.persistence

import org.jooq.DSLContext
import org.slf4j.LoggerFactory
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.stereotype.Component

/**
 * Puts the SQLite database into WAL (write-ahead logging) journal mode at startup.
 *
 * Litestream replicates the WAL; a database in SQLite's default `delete` journal
 * mode produces nothing for it to ship, so off-host backup (#89) would silently
 * back up nothing without this. `journal_mode` is a *persistent* property of the
 * database file — once set it survives reconnects and restarts — so re-running it
 * on every boot is a harmless no-op, and a pre-existing production database is
 * flipped to WAL the first time this runs.
 *
 * It must run OUTSIDE a transaction: `PRAGMA journal_mode=WAL` is a silent no-op
 * inside one. Running it as a startup task on a pool connection (autocommit on, no
 * Flyway migration transaction in flight) satisfies that — and Flyway has finished
 * migrating by the time the application is ready.
 */
@Component
class SqliteWalMode(private val dsl: DSLContext) : ApplicationRunner {

    private val log = LoggerFactory.getLogger(javaClass)

    override fun run(args: ApplicationArguments) {
        val mode = dsl.fetchOne("PRAGMA journal_mode = WAL")?.get(0)?.toString()?.lowercase()
        if (mode == "wal") {
            log.info("SQLite journal mode is WAL — Litestream can replicate the database off-host.")
        } else {
            log.warn(
                "SQLite journal mode is '{}', not WAL — off-host replication will ship nothing " +
                    "(a :memory: or read-only database cannot use WAL).",
                mode,
            )
        }
    }
}
