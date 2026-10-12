package com.tucker.persistence

import com.tucker.jooq.Tables.ENTRY
import com.tucker.security.CurrentUser
import org.jooq.DSLContext
import org.jooq.impl.DSL
import org.springframework.stereotype.Repository
import java.time.LocalDate

/** Where the current User's Entries begin. Scoped to the current User like every read (ADR 0021). */
@Repository
class LoggedDaysRepository(
    private val dsl: DSLContext,
    private val currentUser: CurrentUser,
) {

    /** The day of the User's earliest Entry, or null when they have logged none. */
    fun first(): LocalDate? =
        dsl.select(DSL.min(ENTRY.LOGGED_ON))
            .from(ENTRY)
            .where(ENTRY.USER_ID.eq(currentUser.ownerId))
            .fetchOne { (loggedOn) -> loggedOn?.let(LocalDate::parse) }
}
