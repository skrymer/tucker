package com.tucker.config

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import org.springframework.scheduling.annotation.EnableScheduling

/**
 * Turns on Spring's scheduling so the reminder job
 * ([com.tucker.service.ReminderSchedulerTrigger], ADR 0010) and the nightly metric prune
 * ([com.tucker.service.MetricPruneTrigger], ADR 0038) run. Off under the `smoke` profile,
 * where ticks are driven explicitly, and wherever `tucker.scheduling.enabled` is false —
 * the fast suite, which drives each job's service itself — so no background thread fires
 * mid-test.
 */
@Configuration
@EnableScheduling
@Profile("!smoke")
@ConditionalOnProperty(name = ["tucker.scheduling.enabled"], havingValue = "true", matchIfMissing = true)
class SchedulingConfig
