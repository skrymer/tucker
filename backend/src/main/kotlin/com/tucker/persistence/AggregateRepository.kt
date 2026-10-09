package com.tucker.persistence

import org.jooq.Table

/** A repository whose aggregate is built with its id before it is stored (ADR 0036). */
abstract class AggregateRepository(private val ids: IdSequence, private val table: Table<*>) {

    /**
     * The id the next aggregate stored in [table] is built with. Open so Spring's
     * proxy of a `@Repository` delegates it, rather than running it against the
     * proxy's own unset fields.
     */
    open fun nextId(): Long = ids.next(table)
}
