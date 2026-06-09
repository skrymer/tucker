package com.tucker.config

import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import org.springframework.scheduling.annotation.EnableScheduling

/**
 * Turns on Spring's scheduling so the one reminder job
 * ([com.tucker.service.ReminderSchedulerTrigger]) runs (ADR 0010). Disabled under
 * the `smoke` profile, where ticks are driven explicitly, so no background thread
 * fires during a smoke run.
 */
@Configuration
@EnableScheduling
@Profile("!smoke")
class SchedulingConfig
