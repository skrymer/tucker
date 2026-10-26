package com.tucker.service

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.time.Clock

/**
 * Nightly, hands [MetricRetention] the shared [Clock]'s now. Excluded from the `smoke`
 * profile and switchable off, like [ReminderSchedulerTrigger], so it never fires mid-test.
 */
@Component
@Profile("!smoke")
@ConditionalOnProperty(
    name = ["tucker.metrics.prune-enabled"],
    havingValue = "true",
    matchIfMissing = true,
)
class MetricPruneTrigger(
    private val retention: MetricRetention,
    private val clock: Clock,
) {

    /** 03:30 UTC, between the reminder cron's hourly ticks. */
    @Scheduled(cron = "0 30 3 * * *", zone = "UTC")
    fun fire() {
        retention.prune(clock.instant())
    }
}
