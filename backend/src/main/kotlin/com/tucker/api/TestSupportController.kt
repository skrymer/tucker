package com.tucker.api

import com.tucker.jooq.Tables.ENTRY
import com.tucker.jooq.Tables.FOOD
import com.tucker.jooq.Tables.GOAL
import com.tucker.jooq.Tables.PROFILE
import com.tucker.jooq.Tables.PUSH_SUBSCRIPTION
import com.tucker.jooq.Tables.RECIPE_INGREDIENT
import com.tucker.jooq.Tables.REMINDER_STATE
import com.tucker.jooq.Tables.WEEKLY_REVIEW
import com.tucker.jooq.Tables.WEIGHT_MEASUREMENT
import com.tucker.service.ReminderScheduler
import com.tucker.service.TickResult
import org.jooq.DSLContext
import org.springframework.context.annotation.Profile
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

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
class TestSupportController(
    private val dsl: DSLContext,
    private val reminderScheduler: ReminderScheduler,
) {

    /** Empty every table, restoring the freshly-migrated blank-slate state. */
    @PostMapping("/reset")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun reset() {
        // Delete FK children (entry, recipe_ingredient reference food) before
        // food; the rest are independent. app_config is left intact so the
        // self-bootstrapped VAPID key stays stable across resets (ADR 0012).
        dsl.deleteFrom(RECIPE_INGREDIENT).execute()
        dsl.deleteFrom(ENTRY).execute()
        dsl.deleteFrom(WEEKLY_REVIEW).execute()
        dsl.deleteFrom(GOAL).execute()
        dsl.deleteFrom(WEIGHT_MEASUREMENT).execute()
        dsl.deleteFrom(FOOD).execute()
        dsl.deleteFrom(PUSH_SUBSCRIPTION).execute()
        dsl.deleteFrom(REMINDER_STATE).execute()
        dsl.deleteFrom(PROFILE).execute()
    }

    /**
     * The stored Push Subscription endpoints — exposed only here, under the
     * `smoke` profile, so the enable-reminders smoke can prove that toggling on
     * persisted a subscription (there is no such read on the production API).
     */
    @GetMapping("/push-subscriptions")
    fun pushSubscriptions(): List<String> =
        dsl.select(PUSH_SUBSCRIPTION.ENDPOINT).from(PUSH_SUBSCRIPTION).fetch(PUSH_SUBSCRIPTION.ENDPOINT)

    /**
     * Drive one reminder tick at a pinned instant [at] (ISO-8601), returning what it
     * did. The production trigger is hourly off the wall clock; the smoke needs to
     * place "now" at the user's reminder hour deterministically, so it ticks here
     * instead. Smoke-profile only, like the rest of this controller.
     */
    @PostMapping("/reminder-tick")
    fun reminderTick(@RequestParam at: String): TickResult =
        reminderScheduler.runTick(Instant.parse(at))
}
