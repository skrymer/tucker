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

    /**
     * Replace the caller's own Profile, or write their first one.
     *
     * One statement, keyed on the owner: V12's `idx_profile_user` is what makes
     * `onConflict` able to say "one Profile each" to the database rather than in Kotlin.
     * The field list appears once, which matters more than the saved round trip — split
     * across an update branch and an insert branch, a seventh Profile field omitted from
     * one of them fails silently, as a field that simply never changes.
     */
    fun save(profile: Profile) {
        val row = dsl.newRecord(PROFILE).apply {
            userId = currentUser.ownerId
            sex = profile.sex.name
            birthDate = profile.birthDate.toString()
            heightCm = profile.heightCm
            timezone = profile.timezone
            reminderHour = profile.reminderHour
            remindersEnabled = profile.remindersEnabled.toFlag()
            tracksCalories = profile.tracksCalories.toFlag()
        }
        dsl.insertInto(PROFILE).set(row)
            .onConflict(PROFILE.USER_ID).doUpdate().set(row)
            .execute()
    }

    private fun ProfileRecord.toProfile(): Profile = Profile(
        sex = Sex.valueOf(sex),
        birthDate = LocalDate.parse(birthDate),
        heightCm = heightCm,
        timezone = timezone,
        reminderHour = reminderHour,
        remindersEnabled = remindersEnabled != 0,
        tracksCalories = tracksCalories != 0,
    )

    private fun Boolean.toFlag(): Int = if (this) 1 else 0
}
