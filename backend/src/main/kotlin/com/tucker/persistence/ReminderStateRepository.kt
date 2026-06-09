package com.tucker.persistence

import com.tucker.jooq.Tables.REMINDER_STATE
import com.tucker.jooq.tables.records.ReminderStateRecord
import org.jooq.DSLContext
import org.jooq.TableField
import org.springframework.stereotype.Repository
import java.time.Instant
import java.time.LocalDate

/**
 * Persistence for the single-row reminder bookkeeping (id is always 1): the local
 * day the user was last seen (the absent-today gate) and the instant the last
 * reminder went out (the per-episode dedupe). See [com.tucker.domain.ReminderPolicy].
 */
@Repository
class ReminderStateRepository(private val dsl: DSLContext) {

    /** The user's local day they last opened the app, or null if never. */
    fun lastSeenOn(): LocalDate? =
        dsl.select(REMINDER_STATE.LAST_SEEN_ON)
            .from(REMINDER_STATE)
            .where(REMINDER_STATE.ID.eq(SINGLETON_ID))
            .fetchOne(REMINDER_STATE.LAST_SEEN_ON)
            ?.let(LocalDate::parse)

    /** When the last reminder was sent, or null if none ever was. */
    fun lastReminderSentAt(): Instant? =
        dsl.select(REMINDER_STATE.LAST_REMINDER_SENT_AT)
            .from(REMINDER_STATE)
            .where(REMINDER_STATE.ID.eq(SINGLETON_ID))
            .fetchOne(REMINDER_STATE.LAST_REMINDER_SENT_AT)
            ?.let(Instant::parse)

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

    /** Record that a reminder went out at [at] (overwrites the prior instant). */
    fun stampReminderSent(at: Instant) {
        upsert(REMINDER_STATE.LAST_REMINDER_SENT_AT, at.toString())
    }

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
