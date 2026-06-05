package com.tucker.api

import com.tucker.jooq.Tables.ENTRY
import com.tucker.jooq.Tables.FOOD
import com.tucker.jooq.Tables.GOAL
import com.tucker.jooq.Tables.PROFILE
import com.tucker.jooq.Tables.RECIPE_INGREDIENT
import com.tucker.jooq.Tables.WEEKLY_REVIEW
import com.tucker.jooq.Tables.WEIGHT_MEASUREMENT
import org.jooq.DSLContext
import org.springframework.context.annotation.Profile
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

/**
 * Test-only support endpoint, registered **only** under the `smoke` Spring
 * profile (enabled by docker-compose.smoke.yml). It is absent from the
 * production bean graph, so it can never be reached on the deployed app.
 *
 * Real-stack smokes call `POST /api/test/reset` before each test to get a truly
 * empty database. This is necessary because a `WeeklyReview` is irreversible by
 * design (no delete path), so reviews created by one test would otherwise drag
 * down the adaptive-maintenance baseline of later tests in the same run, making
 * budget assertions non-deterministic (issue #70).
 */
@RestController
@RequestMapping("/api/test")
@Profile("smoke")
class TestSupportController(private val dsl: DSLContext) {

    /** Empty every table, restoring the freshly-migrated blank-slate state. */
    @PostMapping("/reset")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun reset() {
        // Delete FK children (entry, recipe_ingredient reference food) before
        // food; the rest are independent.
        dsl.deleteFrom(RECIPE_INGREDIENT).execute()
        dsl.deleteFrom(ENTRY).execute()
        dsl.deleteFrom(WEEKLY_REVIEW).execute()
        dsl.deleteFrom(GOAL).execute()
        dsl.deleteFrom(WEIGHT_MEASUREMENT).execute()
        dsl.deleteFrom(FOOD).execute()
        dsl.deleteFrom(PROFILE).execute()
    }
}
