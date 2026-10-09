package com.tucker.service

import com.tucker.domain.MicronutrientIntake
import com.tucker.persistence.EntryRepository
import com.tucker.persistence.NutrientReferenceValueRepository
import com.tucker.persistence.ProfileRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate

/** Reads a window's **Micronutrient Intake**: what was eaten, read against the User's body. */
@Service
class MicronutrientIntakeService(
    private val entries: EntryRepository,
    private val borrowedLogs: BorrowedLogs,
    private val referenceValues: NutrientReferenceValueRepository,
    private val profiles: ProfileRepository,
) {

    /**
     * The window [from]..[to], both bounds inclusive.
     *
     * Read-only transactional for [com.tucker.api.IntakeBreakdownController]'s reason:
     * the Foods must describe the Entries that ate them, and holding one connection
     * across both reads is what stops a Food deleted in the gap leaving an Entry
     * nothing can name.
     */
    @Transactional(readOnly = true)
    fun intake(from: LocalDate, to: LocalDate): MicronutrientIntake {
        val eaten = borrowedLogs.of(entries.findBetween(from, to))
        // Resolved once, at the window's END date, so a window spanning a birthday
        // has one answer rather than a different line per day (CONTEXT.md). A User
        // who has not set a Profile up has no body to read against, and every
        // nutrient then earns no claim rather than being read against a guess.
        val references = profiles.get()?.let { referenceValues.all().forBody(it, on = to) }
        return MicronutrientIntake.of(from, to, eaten, references)
    }
}
