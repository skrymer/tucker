package com.tucker.domain

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

/**
 * An **adaptive window**: whether a fortnight's log and weigh-ins are enough to correct
 * Maintenance from, and which floor a hold names when they are not (ADR 0018, ADR 0031).
 */
class AdaptiveWindowTest {

    private val anchor = WeightTrend.Change(kg = -0.5, overDays = 14)
    private val basalRate = 1700.0

    @Test
    fun `a window exactly at both coverage floors adapts`() {
        // Ten logged days and one weighed day are the floors themselves (ADR 0018), so a
        // window standing on them is enough: 20000 kcal over 10 days, and 0.5 kg lost
        // across the fortnight is 275 kcal a day more.
        val window = AdaptiveWindow(
            trendChange = anchor,
            weighedDays = 1,
            intake = LoggedIntake(totalKcal = 20000.0, loggedDays = 10),
        )

        val adapted = assertNotNull(window.adapt(basalRate), "a window at both floors adapts")
        assertEquals(2275.0, adapted.kcal, 0.01)
    }

    @Test
    fun `a window with no anchor is held for the anchor, even when its log is thin too`() {
        // Every new User's second review fails both, and the anchor is the one nothing
        // done today can supply — so it is the one the hold names (ADR 0031).
        val window = AdaptiveWindow(
            trendChange = null,
            weighedDays = 1,
            intake = LoggedIntake(totalKcal = 6000.0, loggedDays = 3),
        )

        assertEquals(Maintenance.HeldReason.NO_WINDOW_ANCHOR, window.holdReason())
    }

    @Test
    fun `a thin log is named before an unweighed window`() {
        // Both can be acted on; the logging floor is the larger ask and the later to
        // clear, so it outranks a single weigh-in (ADR 0031).
        val window = AdaptiveWindow(
            trendChange = anchor,
            weighedDays = 0,
            intake = LoggedIntake(totalKcal = 6000.0, loggedDays = 3),
        )

        assertEquals(Maintenance.HeldReason.THIN_LOG, window.holdReason())
    }

    @Test
    fun `logged days that hold no calories are a thin log`() {
        // Days that carry an Entry of nothing are days, but not an intake to average:
        // an empty total is held as a thin log rather than read as a fortnight of zero.
        val window = AdaptiveWindow(
            trendChange = anchor,
            weighedDays = 1,
            intake = LoggedIntake(totalKcal = 0.0, loggedDays = 10),
        )

        assertEquals(Maintenance.HeldReason.THIN_LOG, window.holdReason())
    }

    @Test
    fun `a window that clears every floor but whose balance is refused is held below the basal rate`() {
        // 8000 kcal over 10 days against a trend that rose 0.5 kg: 800 − 275 = 525 kcal,
        // far under the basal rate. No floor failed, so the hold names the refusal
        // itself (ADR 0031).
        val window = AdaptiveWindow(
            trendChange = WeightTrend.Change(kg = 0.5, overDays = 14),
            weighedDays = 1,
            intake = LoggedIntake(totalKcal = 8000.0, loggedDays = 10),
        )

        assertEquals(null, window.adapt(basalRate))
        assertEquals(Maintenance.HeldReason.BELOW_BASAL_RATE, window.holdReason())
    }
}
