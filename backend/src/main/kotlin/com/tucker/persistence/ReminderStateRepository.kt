package com.tucker.persistence

import com.tucker.jooq.Tables.REMINDER_STATE
import com.tucker.jooq.tables.records.ReminderStateRecord
import org.jooq.DSLContext
import org.jooq.TableField
import org.springframework.stereotype.Repository
import java.time.LocalDate

/**
 * Persistence for the single-row reminder bookkeeping (id is always 1): the local
 * day the user was last seen (the absent-today gate) and the local day the last
 * reminder went out on (the per-episode dedupe). Both are days rather than instants
 * for the reason [com.tucker.domain.ReminderPolicy] gives.
 */
@Repository
class ReminderStateRepository(private val dsl: DSLContext) {

    /** The user's local day they last opened the app, or null if never. */
    fun lastSeenOn(): LocalDate? = readDay(REMINDER_STATE.LAST_SEEN_ON)

    /** The user's local day the last reminder went out on, or null if none ever did. */
    fun lastReminderSentOn(): LocalDate? = readDay(REMINDER_STATE.LAST_REMINDER_SENT_ON)

    /**
     * Record that the user was last seen on [on]. Advance-only: a stamp for a day
     * not after the one already recorded is ignored, so a summary read for an
     * earlier day (e.g. an app left open across midnight refreshing yesterday)
     * can't regress the absent-today gate.
     */
    fun stampSeen(on: LocalDate) {
        val current = lastSeenOn()
        if (current != null && !on.isAfter(current)) return
        upsert(REMINDER_STATE.LAST_SEEN_ON, on.toString())
    }

    /** Record that a reminder went out on the user's local day [on] (overwrites the prior day). */
    fun stampReminderSent(on: LocalDate) {
        upsert(REMINDER_STATE.LAST_REMINDER_SENT_ON, on.toString())
    }

    /** Read one local-day column off the single row, or null if unset. */
    private fun readDay(column: TableField<ReminderStateRecord, String>): LocalDate? =
        dsl.select(column)
            .from(REMINDER_STATE)
            .where(REMINDER_STATE.ID.eq(SINGLETON_ID))
            .fetchOne(column)
            ?.let(LocalDate::parse)

    /** Set one column on the single row, inserting it on first write. */
    private fun upsert(column: TableField<ReminderStateRecord, String>, value: String) {
        dsl.insertInto(REMINDER_STATE)
            .set(REMINDER_STATE.ID, SINGLETON_ID)
            .set(column, value)
            .onConflict(REMINDER_STATE.ID)
            .doUpdate()
            .set(column, value)
            .execute()
    }

    private companion object {
        const val SINGLETON_ID = 1
    }
}
