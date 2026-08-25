package com.tucker.service

import com.tucker.domain.Profile
import com.tucker.persistence.ProfileRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate

/**
 * Application logic for the Profile — chiefly, keeping the Weekly Review in step
 * with a change of Calorie Tracking.
 */
@Service
class ProfileService(
    private val profiles: ProfileRepository,
    private val weeklyReview: WeeklyReviewService,
) {

    /**
     * Save [profile], force-recomputing [today]'s Weekly Review when Calorie
     * Tracking changed.
     *
     * Toggling is the fourth review trigger, alongside the weekly lazy catch-up, the
     * manual run and a Goal lifecycle change — and it is one for the reason ADR 0008
     * gives for that third: reviews are held steady between clock-driven ticks, so
     * without this a User who turns tracking on gets a Log-entry button and no
     * Budget for up to a week, and one who turns it off keeps a stale Budget on `/`
     * for just as long.
     *
     * Only on a change, and only once setup is complete. A first Profile turns
     * nothing on or off — there is no earlier answer for this one to differ from —
     * and a recompute before there is a Weight Measurement has no Trend Weight to
     * run against.
     */
    @Transactional
    fun save(profile: Profile, today: LocalDate): Profile {
        val previous = profiles.get()
        profiles.save(profile)
        val trackingChanged = previous != null && previous.tracksCalories != profile.tracksCalories
        if (trackingChanged && weeklyReview.setupComplete()) weeklyReview.recomputeFor(today)
        return profile
    }
}
