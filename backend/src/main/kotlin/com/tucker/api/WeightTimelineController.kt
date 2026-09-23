package com.tucker.api

import com.tucker.domain.GoalTrajectory
import com.tucker.domain.TimelineEvidence
import com.tucker.domain.TimelineEvidenceSummary
import com.tucker.domain.TimelineIntake
import com.tucker.domain.WeightTimeline
import com.tucker.domain.WeightTimelineDay
import com.tucker.persistence.EntryRepository
import com.tucker.persistence.GoalRepository
import com.tucker.persistence.ProfileRepository
import com.tucker.persistence.WeeklyReviewRepository
import com.tucker.persistence.WeightMeasurementRepository
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate

/**
 * One day on the wire. [weightKg] is null on a day nobody weighed in — absent,
 * never zero (ADR 0023); [trendKg] is the Trend Weight standing through the day.
 *
 * [caloriesKcal] and [calorieBudgetKcal] are the intake half, and are null
 * throughout with Calorie Tracking off. Within a tracking window [caloriesKcal] is
 * null on a day with no Entry — absent, never zero, which is what keeps a gap from
 * reading as a day of eating nothing — while [calorieBudgetKcal] carries the
 * Budget in force on the date, and so spans that gap: a Budget is set by a Weekly
 * Review and holds all week. It is null only before the first review, and where the
 * review in force carried no Intake Targets (ADR 0024).
 *
 * [overBudget] is the verdict rather than the comparison, so a client cannot
 * disagree with the same day's DayStatus (ADR 0002); it is null when there is
 * nothing to exceed.
 *
 * [trajectoryKg] is where the active Goal's plan puts the Trend Weight on the day,
 * and takes the intake half's place: it is null throughout with Calorie Tracking
 * on and in Maintenance Mode, and on a day before the Goal was set.
 */
data class WeightTimelineDayResponse(
    val date: LocalDate,
    val weightKg: Double?,
    val trendKg: Double,
    val caloriesKcal: Double?,
    val calorieBudgetKcal: Double?,
    val overBudget: Boolean?,
    val trajectoryKg: Double?,
)

/**
 * A Weight Timeline on the wire (ADR 0029). [from] is where the timeline starts,
 * which is the requested window's start or the User's first reading, whichever is
 * later — so a client describing the window reads these bounds rather than the
 * ones it asked for.
 *
 * [evidence] says which of the two halves was drawn beside the weight, and is null
 * when neither was — Maintenance Mode with Calorie Tracking off.
 */
data class WeightTimelineResponse(
    val from: LocalDate,
    val to: LocalDate,
    val days: List<WeightTimelineDayResponse>,
    val evidence: TimelineEvidenceResponse?,
)

/** Which half a [WeightTimelineResponse] drew beside the weight. */
enum class TimelineEvidenceKind { INTAKE, PLAN }

/**
 * What the timeline drew beside the weight, and the one figure that half states
 * about the window (ADR 0029).
 *
 * Discriminated by [kind] rather than left as two sibling nullables on the
 * response: siblings admit a timeline claiming both halves, which is a state the
 * domain does not have, and leave every client to re-establish that they agree
 * (ADR 0024). The same shape [BarcodeLookupResponse] uses for its outcomes.
 *
 * [loggedDays] is set for [TimelineEvidenceKind.INTAKE] and says how many of the
 * drawn days carry an Entry; [planStartsOn] is set for
 * [TimelineEvidenceKind.PLAN] and is the day the active Goal's plan begins, which
 * may be after the window ends.
 */
data class TimelineEvidenceResponse(
    /** The domain discriminator, so the spec lists the values (see [FoodResponse.kind]). */
    val kind: TimelineEvidenceKind,
    val loggedDays: Int?,
    val planStartsOn: LocalDate?,
)

private fun WeightTimelineDay.toResponse() = WeightTimelineDayResponse(
    date = date,
    weightKg = weightKg,
    trendKg = trendKg,
    caloriesKcal = caloriesKcal,
    calorieBudgetKcal = calorieBudgetKcal,
    overBudget = overBudget,
    trajectoryKg = trajectoryKg,
)

/**
 * Flattened in an exhaustive `when` rather than by two `as?`, so a third evidence
 * kind is a compile error here instead of a silently absent field (ADR 0024).
 */
private fun TimelineEvidenceSummary.toResponse() = when (this) {
    is TimelineEvidenceSummary.Intake ->
        TimelineEvidenceResponse(TimelineEvidenceKind.INTAKE, loggedDays = loggedDays, planStartsOn = null)
    is TimelineEvidenceSummary.Plan ->
        TimelineEvidenceResponse(TimelineEvidenceKind.PLAN, loggedDays = null, planStartsOn = startsOn)
}

private fun WeightTimeline.toResponse() = WeightTimelineResponse(
    from = from,
    to = to,
    days = days.map { it.toResponse() },
    evidence = evidence?.toResponse(),
)

@RestController
@RequestMapping("/api/weight-timeline")
class WeightTimelineController(
    private val weights: WeightMeasurementRepository,
    private val entries: EntryRepository,
    private val reviews: WeeklyReviewRepository,
    private val profiles: ProfileRepository,
    private val goals: GoalRepository,
) {

    /**
     * The timeline over the window [from]..[to], both bounds inclusive and 28 or 90
     * days wide. The whole reading history is read, not the window's slice: the
     * trend at a window's start depends on readings from before it.
     *
     * Deliberately does **not** advance the review cadence or stamp the last-seen
     * day — only `/` and a Check do, and widening that here would change when the
     * Weekly-Review Reminder fires as a side effect of drawing a chart (ADR 0029).
     *
     * Read-only transactional because the Budget line has to describe the bars
     * beside it: a review written between the two reads would put a figure on the
     * chart the day's calories were never measured against.
     */
    @Transactional(readOnly = true)
    @GetMapping
    fun timeline(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) from: LocalDate,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) to: LocalDate,
    ): WeightTimelineResponse =
        WeightTimeline.of(from, to, weights.findAll()) { evidenceOver(from, to) }?.toResponse()
            ?: throw NotFoundException("a Weight Timeline needs at least a fortnight of readings")

    /**
     * What the timeline draws beside the weight — the intake half, or with Calorie
     * Tracking off the active Goal's planned trajectory, which takes its place
     * (ADR 0029). Null in Maintenance Mode, where Tucker defends no target weight
     * and so has no plan to draw (ADR 0008).
     *
     * The setting is read as "not off" rather than "on", so a User who has yet to
     * complete setup is treated as the default the Profile would give them (ADR 0024).
     */
    private fun evidenceOver(from: LocalDate, to: LocalDate): TimelineEvidence? =
        if (profiles.get()?.tracksCalories == false) {
            goals.findActive()?.let { GoalTrajectory(it) }
        } else {
            TimelineIntake(
                caloriesByDay = entries.caloriesByDay(from, to),
                // The whole history, not the window's slice: the Budget in force on the
                // first drawn day was set by a review that may predate the window.
                reviews = reviews.findAll(),
            )
        }
}
