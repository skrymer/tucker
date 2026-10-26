package com.tucker.service

import org.springframework.test.context.TestContext
import org.springframework.test.context.TestExecutionListener

/**
 * Clears the [MetricRateCap] after every Spring test, so none inherits a count an earlier
 * one ran up under an id a rollback freed. Registered for every test class through
 * `META-INF/spring.factories`.
 */
class ForgetMetricRateCapListener : TestExecutionListener {

    override fun afterTestMethod(testContext: TestContext) {
        if (testContext.hasApplicationContext()) {
            testContext.applicationContext.getBeanProvider(MetricRateCap::class.java).ifAvailable { it.forget() }
        }
    }
}
