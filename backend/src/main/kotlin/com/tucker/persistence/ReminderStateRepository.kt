package com.tucker.persistence

import com.tucker.jooq.Tables.REMINDER_STATE
import com.tucker.jooq.tables.records.ReminderStateRecord
import com.tucker.security.CurrentUser
import org.jooq.DSLContext
import org.jooq.TableField
import org.springframework.stereotype.Repository
import java.time.LocalDate

/**
 * Persistence for one User's reminder bookkeeping: the local day they were last seen
 * (the absent-today gate) and the local day their last reminder went out on (the
 * per-episode dedupe). Both are days rather than instants for the reason
 * [com.tucker.domain.ReminderPolicy] gives.
 *
 * Scoped implicitly like everything else (ADR 0021), and both columns need it for the
 * same reason: each is read as *the* answer for a person, so a shared row makes one
 * User's behaviour decide another's reminder. Shared, one person opening Tucker stamps
 * the last-seen day and silences everybody's absent-today gate, and the first send of a
 * tick stamps the dedupe and suppresses every later User in the same overdue episode —
 * one nudge per installation, where ADR 0010 specifies one per User.
 */
@Repository
class ReminderStateRepository(
    private val dsl: DSLContext,
    private val currentUser: CurrentUser,
) {

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

    /** Read one local-day column off the caller's own row, or null if unset. */
    private fun readDay(column: TableField<ReminderStateRecord, String>): LocalDate? =
        dsl.select(column)
            .from(REMINDER_STATE)
            .where(REMINDER_STATE.USER_ID.eq(currentUser.ownerId))
            .fetchOne(column)
            ?.let(LocalDate::parse)

    /** Set one column on the caller's own row, inserting it on their first write. */
    private fun upsert(column: TableField<ReminderStateRecord, String>, value: String) {
        dsl.insertInto(REMINDER_STATE)
            .set(REMINDER_STATE.USER_ID, currentUser.ownerId)
            .set(column, value)
            .onConflict(REMINDER_STATE.USER_ID)
            .doUpdate()
            .set(column, value)
            .execute()
    }
}
