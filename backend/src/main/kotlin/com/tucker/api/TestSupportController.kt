package com.tucker.api

import com.tucker.jooq.DefaultSchema.DEFAULT_SCHEMA
import com.tucker.jooq.Tables.PUSH_SUBSCRIPTION
import com.tucker.persistence.RecordingWebPushSender
import com.tucker.service.ReminderScheduler
import com.tucker.service.TickResult
import org.jooq.DSLContext
import org.springframework.context.annotation.Profile
import org.springframework.http.HttpStatus
import org.springframework.transaction.annotation.Transactional
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
    private val pushSender: RecordingWebPushSender,
) {

    /**
     * Empty every table but the [INSTALLATION_WIDE] ones, and the push recorder,
     * restoring the blank-slate state — the recorder included because it is a singleton
     * bean, so it outlives the database it describes and one smoke would otherwise read
     * what an earlier one sent. Taken from the schema, so a new table is reset unless it
     * is named as kept.
     */
    @PostMapping("/reset")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    fun reset() {
        // Foreign keys are checked at the commit, by when every referencing row is
        // gone too, so the tables can be emptied in any order. Users go with the
        // rest — whoever is making *this* request included: they are provisioned
        // again by their next one, which is the point, since a smoke about a
        // brand-new User needs a database that has never seen them.
        dsl.execute("PRAGMA defer_foreign_keys = ON")
        DEFAULT_SCHEMA.tables.filterNot { it.name in INSTALLATION_WIDE }.forEach { dsl.deleteFrom(it).execute() }
        pushSender.forget()
    }

    /**
     * The stored Push Subscription endpoints — exposed only here, under the
     * `smoke` profile, so the enable-reminders smoke can prove that toggling on
     * persisted a subscription (there is no such read on the production API).
     *
     * Deliberately **installation-wide**, unlike every production read of that table,
     * which is scoped to its owner (ADR 0021). A smoke asserting "nothing was stored"
     * has to be able to see rows belonging to anyone, and one asserting a device was
     * stored has no signed-in User on the assertion side. Whose a device is, is asserted
     * where it is decided — `ReminderSchedulerIntegrationTest`.
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

    /**
     * The raw push payloads this test's ticks have sent, oldest first — the JSON the
     * service worker would parse. Installation-wide, like `/push-subscriptions` above,
     * and for the same reason.
     */
    @GetMapping("/push-payloads")
    fun pushPayloads(): List<String> = pushSender.sentPayloads()

    private companion object {
        /**
         * Seeded by migrations or bootstrapped by the app, and the same for everybody:
         * `app_config` holds the self-bootstrapped VAPID key, which must stay stable
         * across resets (ADR 0012).
         */
        val INSTALLATION_WIDE = setOf(
            "app_config",
            "id_sequence",
            "nutrient_reference_value",
            "reference_food",
            "reference_food_synonym",
        )
    }
}
