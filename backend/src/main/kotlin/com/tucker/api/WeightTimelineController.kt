package com.tucker.api

import com.tucker.domain.WeightTimeline
import com.tucker.domain.WeightTimelineDay
import com.tucker.persistence.WeightMeasurementRepository
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate

/**
 * One day on the wire. [weightKg] is null on a day nobody weighed in — absent,
 * never zero (ADR 0023); [trendKg] is the Trend Weight standing through the day.
 */
data class WeightTimelineDayResponse(
    val date: LocalDate,
    val weightKg: Double?,
    val trendKg: Double,
)

/**
 * A Weight Timeline on the wire (ADR 0029). [from] is where the timeline starts,
 * which is the requested window's start or the User's first reading, whichever is
 * later — so a client describing the window reads these bounds rather than the
 * ones it asked for.
 */
data class WeightTimelineResponse(
    val from: LocalDate,
    val to: LocalDate,
    val days: List<WeightTimelineDayResponse>,
)

private fun WeightTimelineDay.toResponse() = WeightTimelineDayResponse(
    date = date,
    weightKg = weightKg,
    trendKg = trendKg,
)

private fun WeightTimeline.toResponse() = WeightTimelineResponse(
    from = from,
    to = to,
    days = days.map { it.toResponse() },
)

@RestController
@RequestMapping("/api/weight-timeline")
class WeightTimelineController(
    private val weights: WeightMeasurementRepository,
) {

    /**
     * The timeline over the window [from]..[to], both bounds inclusive and 28 or 90
     * days wide. The whole reading history is read, not the window's slice: the
     * trend at a window's start depends on readings from before it.
     *
     * Deliberately does **not** advance the review cadence or stamp the last-seen
     * day — only `/` and a Check do, and widening that here would change when the
     * Weekly-Review Reminder fires as a side effect of drawing a chart (ADR 0029).
     */
    @GetMapping
    fun timeline(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) from: LocalDate,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) to: LocalDate,
    ): WeightTimelineResponse =
        WeightTimeline.of(from, to, weights.findAll())?.toResponse()
            ?: throw NotFoundException("a Weight Timeline needs at least a fortnight of readings")
}
