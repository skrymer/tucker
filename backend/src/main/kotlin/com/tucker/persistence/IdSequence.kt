package com.tucker.persistence

import com.tucker.jooq.Tables.ID_SEQUENCE
import org.jooq.DSLContext
import org.jooq.Table
import org.springframework.stereotype.Component

/** Hands out the id an aggregate is built with, before it is stored (ADR 0036). */
@Component
class IdSequence(private val dsl: DSLContext) {

    /** The next unused id for a row of [table]. */
    fun next(table: Table<*>): Long =
        dsl.update(ID_SEQUENCE)
            .set(ID_SEQUENCE.LAST_ID, ID_SEQUENCE.LAST_ID.plus(1))
            .where(ID_SEQUENCE.NAME.eq(table.name))
            .returningResult(ID_SEQUENCE.LAST_ID)
            .fetchSingleInto(Long::class.javaObjectType)
}
