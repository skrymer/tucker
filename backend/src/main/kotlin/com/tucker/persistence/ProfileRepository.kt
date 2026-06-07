package com.tucker.persistence

import com.tucker.domain.Profile
import com.tucker.domain.Sex
import com.tucker.jooq.Tables.PROFILE
import com.tucker.jooq.tables.records.ProfileRecord
import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import java.time.LocalDate

/** Persistence for the single-row [Profile] (id is always 1). */
@Repository
class ProfileRepository(private val dsl: DSLContext) {

    fun get(): Profile? =
        dsl.selectFrom(PROFILE).where(PROFILE.ID.eq(SINGLETON_ID)).fetchOne()?.toProfile()

    fun save(profile: Profile) {
        if (dsl.fetchExists(PROFILE, PROFILE.ID.eq(SINGLETON_ID))) {
            dsl.update(PROFILE)
                .set(PROFILE.SEX, profile.sex.name)
                .set(PROFILE.BIRTH_DATE, profile.birthDate.toString())
                .set(PROFILE.HEIGHT_CM, profile.heightCm.toFloat())
                .set(PROFILE.TIMEZONE, profile.timezone)
                .set(PROFILE.REMINDER_HOUR, profile.reminderHour)
                .set(PROFILE.REMINDERS_ENABLED, profile.remindersEnabled.toFlag())
                .where(PROFILE.ID.eq(SINGLETON_ID))
                .execute()
        } else {
            dsl.insertInto(PROFILE)
                .set(PROFILE.ID, SINGLETON_ID)
                .set(PROFILE.SEX, profile.sex.name)
                .set(PROFILE.BIRTH_DATE, profile.birthDate.toString())
                .set(PROFILE.HEIGHT_CM, profile.heightCm.toFloat())
                .set(PROFILE.TIMEZONE, profile.timezone)
                .set(PROFILE.REMINDER_HOUR, profile.reminderHour)
                .set(PROFILE.REMINDERS_ENABLED, profile.remindersEnabled.toFlag())
                .execute()
        }
    }

    private fun ProfileRecord.toProfile(): Profile = Profile(
        sex = Sex.valueOf(sex),
        birthDate = LocalDate.parse(birthDate),
        heightCm = heightCm.toDouble(),
        timezone = timezone,
        reminderHour = reminderHour,
        remindersEnabled = remindersEnabled != 0,
    )

    private fun Boolean.toFlag(): Int = if (this) 1 else 0

    private companion object {
        const val SINGLETON_ID = 1
    }
}
