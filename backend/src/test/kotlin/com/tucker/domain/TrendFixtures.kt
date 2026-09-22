package com.tucker.domain

import java.time.LocalDate

/** A reading of [kg] taken on [on]. */
fun weighed(on: LocalDate, kg: Double) =
    WeightMeasurement(id = null, measuredOn = on, weightKg = kg)

/**
 * A two-reading trend ending on [today], which fell from [fromKg] to [toKg] across
 * [overDays].
 *
 * Weighed rather than hand-placed, because a change or a rate read from the trend
 * divides the smoothing's own shrinkage back out (ADR 0032), and that can only be
 * divided out of something it actually shrank. Two hand-placed points are not a
 * trend the smoothing produced, so a fall between them reads several percent fast.
 */
fun trendFalling(fromKg: Double, toKg: Double, overDays: Long, today: LocalDate) =
    WeightTrend.from(
        listOf(weighed(today.minusDays(overDays), fromKg), weighed(today, toKg)),
    )
