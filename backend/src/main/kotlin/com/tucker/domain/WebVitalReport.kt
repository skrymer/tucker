package com.tucker.domain

/** One web vital in one layout: its [n] always, its percentiles once there are enough. */
data class VitalLayoutFigures(val layout: MetricLayout, val n: Int, val percentiles: Percentiles?)

/**
 * Page load (LCP) and interaction (INP) per layout, whichever route each happened on
 * (ADR 0038).
 */
data class WebVitalReport(val lcp: List<VitalLayoutFigures>, val inp: List<VitalLayoutFigures>) {
    companion object {
        fun of(vitals: List<WebVital>): WebVitalReport {
            val byKind = vitals.groupBy { it.kind }
            return WebVitalReport(
                figuresOf(byKind[MetricKind.LCP].orEmpty()),
                figuresOf(byKind[MetricKind.INP].orEmpty()),
            )
        }

        private fun figuresOf(vitals: List<WebVital>): List<VitalLayoutFigures> {
            val byLayout = vitals.groupBy { it.source.layout }
            return MetricLayout.entries.map { layout ->
                val times = byLayout[layout].orEmpty().map { it.valueMs }
                val enough = times.size >= LayoutFigures.MIN_SAMPLES
                VitalLayoutFigures(layout, times.size, if (enough) Percentiles.of(times) else null)
            }
        }
    }
}
