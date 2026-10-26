package com.tucker.config

import com.tucker.domain.MetricRateCap
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/** One cap for the whole process, held in memory, so capping a User stores nothing about them (ADR 0038). */
@Configuration
class MetricRateCapConfig {
    @Bean
    fun metricRateCap() = MetricRateCap()
}
