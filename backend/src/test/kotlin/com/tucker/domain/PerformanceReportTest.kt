package com.tucker.domain

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** What an Admin reads of how Tucker performs (ADR 0038, ADR 0039): percentiles, never averages. */
class PerformanceReportTest {

    /** Nearest rank: the p-th percentile of n samples is the ⌈p·n⌉-th smallest. */
    @Test
    fun `states the 50th, 75th and 95th percentile of a route's times`() {
        val report = PerformanceReport.of((1..20).shuffled().map { routeChange(valueMs = it * 10) })

        val phone = report.figuresFor("/review", MetricLayout.PHONE)
        assertEquals(Percentiles(p50 = 100, p75 = 150, p95 = 190), phone.percentiles)
    }

    @Test
    fun `four samples are too few for a figure and carry only their count`() {
        val report = PerformanceReport.of(List(4) { routeChange() })

        val phone = report.figuresFor("/review", MetricLayout.PHONE)
        assertEquals(4, phone.n)
        assertNull(phone.percentiles)
    }

    @Test
    fun `five samples are enough for a figure`() {
        val report = PerformanceReport.of(List(5) { routeChange(valueMs = 300) })

        assertEquals(Percentiles(300, 300, 300), report.figuresFor("/review", MetricLayout.PHONE).percentiles)
    }

    @Test
    fun `a route measured only on a phone states desktop too, with none counted`() {
        val report = PerformanceReport.of(List(5) { routeChange(layout = MetricLayout.PHONE) })

        val desktop = report.figuresFor("/review", MetricLayout.DESKTOP)
        assertEquals(0, desktop.n)
        assertNull(desktop.percentiles)
    }

    /** By the slower of its two layouts, so a route slow on phones alone still leads. */
    @Test
    fun `lists the slowest route first and a route with too few samples last`() {
        val report = PerformanceReport.of(
            List(4) { routeChange(route = "/today", valueMs = 5_000) } +
                List(5) { routeChange(route = "/foods", layout = MetricLayout.DESKTOP, valueMs = 600) } +
                List(5) { routeChange(route = "/review", layout = MetricLayout.PHONE, valueMs = 900) } +
                List(5) { routeChange(route = "/review", layout = MetricLayout.DESKTOP, valueMs = 100) },
        )

        assertEquals(listOf("/review", "/foods", "/today"), report.routes.map { it.route })
    }

    private fun PerformanceReport.figuresFor(route: String, layout: MetricLayout) =
        routes.single { it.route == route }.layouts.single { it.layout == layout }

    private fun routeChange(
        route: String = "/review",
        layout: MetricLayout = MetricLayout.PHONE,
        valueMs: Int = 420,
    ) = MetricEvent(
        kind = MetricKind.ROUTE_CHANGE,
        route = route,
        valueMs = valueMs,
        source = MetricSource(layout = layout, installed = false, appVersion = "1.4.0"),
    )
}
