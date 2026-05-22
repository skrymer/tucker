package com.tucker.service

import com.tucker.domain.Goal
import com.tucker.persistence.GoalRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/** Application logic for Goals — chiefly, replacing the active Goal atomically. */
@Service
class GoalService(private val goals: GoalRepository) {

    /** Deactivate any current Goal and make [goal] the single active one. */
    @Transactional
    fun replaceActiveGoal(goal: Goal): Goal {
        goals.deactivateAll()
        return goals.insert(goal)
    }
}
