package com.tucker.persistence

import com.tucker.domain.Profile
import com.tucker.domain.Sex
import com.tucker.jooq.Tables.PROFILE
import com.tucker.jooq.tables.records.ProfileRecord
import com.tucker.security.CurrentUser
import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import java.time.LocalDate

/**
 * Persistence for one User's [Profile] — the body the Maintenance seed is computed
 * from, and the locale and reminder preferences the nudge is scheduled by (ADR 0021).
 *
 * Scoped implicitly like everything else, so no method here takes an owner. The
 * Profile used to be *the* Profile, one row keyed on the constant 1, and the switch is
 * not merely about privacy: with a shared row, one person completing setup would
 * silently answer "how big is this person" for everybody, so a second User would find
 * themselves set up already, with a Calorie Budget derived from a body that is not
 * theirs and nothing on any screen to say so.
 */
@Repository
class ProfileRepository(
    private val dsl: DSLContext,
    private val currentUser: CurrentUser,
) {

    fun get(): Profile? =
        dsl.selectFrom(PROFILE)
            .where(PROFILE.USER_ID.eq(currentUser.ownerId))
            .fetchOne()?.toProfile()

    /** Replace the caller's own Profile, or write their first one. */
    fun save(profile: Profile) {
        val updated = dsl.update(PROFILE)
            .set(PROFILE.SEX, profile.sex.name)
            .set(PROFILE.BIRTH_DATE, profile.birthDate.toString())
            .set(PROFILE.HEIGHT_CM, profile.heightCm)
            .set(PROFILE.TIMEZONE, profile.timezone)
            .set(PROFILE.REMINDER_HOUR, profile.reminderHour)
            .set(PROFILE.REMINDERS_ENABLED, profile.remindersEnabled.toFlag())
            .where(PROFILE.USER_ID.eq(currentUser.ownerId))
            .execute()
        if (updated > 0) return

        dsl.insertInto(PROFILE)
            .set(PROFILE.USER_ID, currentUser.ownerId)
            .set(PROFILE.SEX, profile.sex.name)
            .set(PROFILE.BIRTH_DATE, profile.birthDate.toString())
            .set(PROFILE.HEIGHT_CM, profile.heightCm)
            .set(PROFILE.TIMEZONE, profile.timezone)
            .set(PROFILE.REMINDER_HOUR, profile.reminderHour)
            .set(PROFILE.REMINDERS_ENABLED, profile.remindersEnabled.toFlag())
            .execute()
    }

    private fun ProfileRecord.toProfile(): Profile = Profile(
        sex = Sex.valueOf(sex),
        birthDate = LocalDate.parse(birthDate),
        heightCm = heightCm,
        timezone = timezone,
        reminderHour = reminderHour,
        remindersEnabled = remindersEnabled != 0,
    )

    private fun Boolean.toFlag(): Int = if (this) 1 else 0
}
