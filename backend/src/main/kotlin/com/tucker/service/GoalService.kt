package com.tucker.service

import com.tucker.domain.Goal
import com.tucker.persistence.GoalRepository
import com.tucker.persistence.WeeklyReviewRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate

/** Application logic for Goals — chiefly, replacing the active Goal atomically. */
@Service
class GoalService(
    private val goals: GoalRepository,
    private val reviews: WeeklyReviewRepository,
    private val weeklyReview: WeeklyReviewService,
) {

    /**
     * Deactivate any current Goal and make [goal] the single active one.
     *
     * On a fresh install — when no [com.tucker.domain.WeeklyReview] has ever run —
     * the new Goal immediately triggers the first weekly review so the dashboard
     * shows a real Calorie Budget without waiting for the weekly cadence. This is
     * a deliberate direct call rather than a domain event: single consumer, and
     * we want the save and the first review committed in one transaction.
     * Subsequent Goal replacements do not re-run the review — the Budget moves
     * only on the next review cadence.
     */
    @Transactional
    fun replaceActiveGoal(goal: Goal, today: LocalDate = LocalDate.now()): Goal {
        goals.deactivateAll()
        val saved = goals.insert(goal)
        if (reviews.latest() == null) {
            weeklyReview.runReview(today)
        }
        return saved
    }
}
