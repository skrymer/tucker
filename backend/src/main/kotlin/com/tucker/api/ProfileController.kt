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
    // Locale + Weekly-Review Reminder preferences. Optional on the wire: a PUT
    // that omits them (e.g. the body-stats form on first save) falls back to the
    // safe defaults rather than failing.
    val timezone: String = Profile.DEFAULT_TIMEZONE,
    val reminderHour: Int = Profile.DEFAULT_REMINDER_HOUR,
    val remindersEnabled: Boolean = false,
)

private fun Profile.toDto() = ProfileDto(
    sex = sex.name,
    birthDate = birthDate,
    heightCm = heightCm,
    timezone = timezone,
    reminderHour = reminderHour,
    remindersEnabled = remindersEnabled,
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
        )
        profiles.save(profile)
        return profile.toDto()
    }
}
