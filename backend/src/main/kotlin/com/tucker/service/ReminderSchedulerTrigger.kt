package com.tucker.service

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.time.Clock

/**
 * Tucker's one and only scheduled job (ADR 0010): every hour, ask the
 * [ReminderScheduler] to send the Weekly-Review Reminder if it is due. The trigger
 * is intentionally thin — it just supplies "now" from the shared [Clock] and
 * delegates; all the logic lives in [ReminderScheduler] and [com.tucker.domain.ReminderPolicy].
 *
 * Excluded from the `smoke` profile: smokes drive ticks explicitly through the
 * test endpoint with a pinned instant, so an hourly cron never races them.
 */
@Component
@Profile("!smoke")
@ConditionalOnProperty(
    name = ["tucker.reminders.scheduler-enabled"],
    havingValue = "true",
    matchIfMissing = true,
)
class ReminderSchedulerTrigger(
    private val scheduler: ReminderScheduler,
    private val clock: Clock,
) {

    /** On the hour, every hour. The policy gates everything else (local hour, dedupe…). */
    @Scheduled(cron = "0 0 * * * *")
    fun fire() {
        scheduler.runTick(clock.instant())
    }
}
