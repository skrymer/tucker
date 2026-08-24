package com.tucker.api

import com.tucker.domain.Profile
import com.tucker.domain.Sex
import com.tucker.persistence.ProfileRepository
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate

/** API representation of the user's Profile — used for both GET and PUT. */
data class ProfileDto(
    val sex: String,
    val birthDate: LocalDate,
    val heightCm: Double,
    // Locale, Weekly-Review Reminder preferences, and Calorie Tracking. Optional
    // on the wire so a PUT that omits them (the body-stats form on a first save)
    // falls back to the domain's default rather than failing.
    //
    // A PUT is a whole-Profile replace, so an omitted field is *overwritten* with
    // that default, not left alone — and for Calorie Tracking the default is on,
    // which is the one here that is not also the conservative answer. What keeps
    // that safe is the clients, not this line: both writers PUT the Profile they
    // loaded with their own fields merged over it, and the loaded object carries
    // every field the backend serves whatever the client's types say. A caller
    // that sends bare body stats is therefore setting up a Profile, not editing
    // one, which is exactly when the default is the right answer.
    val timezone: String = Profile.DEFAULT_TIMEZONE,
    val reminderHour: Int = Profile.DEFAULT_REMINDER_HOUR,
    val remindersEnabled: Boolean = false,
    val tracksCalories: Boolean = Profile.DEFAULT_TRACKS_CALORIES,
)

private fun Profile.toDto() = ProfileDto(
    sex = sex.name,
    birthDate = birthDate,
    heightCm = heightCm,
    timezone = timezone,
    reminderHour = reminderHour,
    remindersEnabled = remindersEnabled,
    tracksCalories = tracksCalories,
)

@RestController
@RequestMapping("/api/profile")
class ProfileController(private val profiles: ProfileRepository) {

    @GetMapping
    fun get(): ProfileDto =
        profiles.get()?.toDto() ?: throw NotFoundException("profile not set")

    @PutMapping
    fun save(@RequestBody request: ProfileDto): ProfileDto {
        val profile = Profile(
            sex = Sex.valueOf(request.sex),
            birthDate = request.birthDate,
            heightCm = request.heightCm,
            timezone = request.timezone,
            reminderHour = request.reminderHour,
            remindersEnabled = request.remindersEnabled,
            tracksCalories = request.tracksCalories,
        )
        profiles.save(profile)
        return profile.toDto()
    }
}
