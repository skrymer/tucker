package com.tucker.domain

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

/** Page load and interaction per layout (ADR 0038): percentiles, never averages. */
class WebVitalReportTest {

    @Test
    fun `states the 50th, 75th and 95th percentile of the page loads in a layout`() {
        val report = WebVitalReport.of((1..20).shuffled().map { vital(VitalKind.LCP, valueMs = it * 100) })

        val phone = report.lcp.figuresFor(MetricLayout.PHONE)
        assertEquals(Percentiles(p50 = 1_000, p75 = 1_500, p95 = 1_900), phone.percentiles)
    }

    @Test
    fun `four page loads are too few for a figure and carry only their count, and five are enough`() {
        val four = WebVitalReport.of(List(4) { vital(VitalKind.LCP) }).lcp.figuresFor(MetricLayout.PHONE)
        val five = WebVitalReport.of(List(5) { vital(VitalKind.LCP) }).lcp.figuresFor(MetricLayout.PHONE)

        assertEquals(VitalLayoutFigures(MetricLayout.PHONE, n = 4, percentiles = null), four)
        assertEquals(Percentiles(1_000, 1_000, 1_000), five.percentiles)
    }

    @Test
    fun `reads interactions apart from page loads`() {
        val report = WebVitalReport.of(
            List(5) { vital(VitalKind.INP, valueMs = 160) } + List(3) { vital(VitalKind.LCP, valueMs = 2_000) },
        )

        assertEquals(
            VitalLayoutFigures(MetricLayout.PHONE, 5, Percentiles(160, 160, 160)),
            report.inp.figuresFor(MetricLayout.PHONE),
        )
        assertEquals(3, report.lcp.figuresFor(MetricLayout.PHONE).n)
    }

    private fun List<VitalLayoutFigures>.figuresFor(layout: MetricLayout) = single { it.layout == layout }

    private fun vital(
        kind: VitalKind,
        layout: MetricLayout = MetricLayout.PHONE,
        valueMs: Int = 1_000,
        route: String = "/review",
    ) = WebVital(
        kind,
        route = route,
        valueMs = valueMs,
        source = MetricSource(
            layout = layout,
            installed = false,
            appVersion = "1.4.0",
            platform = Platform(BrowserEngine.WEBKIT, OperatingSystem.IOS),
        ),
    )
}
