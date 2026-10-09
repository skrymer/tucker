package com.tucker.domain

/**
 * The evidence one adaptive window holds — its Trend Weight change, the days it was
 * weighed on, its logged intake — and whether it is enough to correct Maintenance from.
 *
 * One floor per term, because the estimate is one energy balance and either term alone
 * is not it (ADR 0018): enough logging that the average isn't set by one or two noisy
 * days, and enough weighing that the window has a change to contribute at all. Tracked
 * separately because a hold names the floor it failed, and "log more days" is wrong
 * advice to somebody who simply has not weighed in (ADR 0031).
 */
class AdaptiveWindow(
    trendChange: WeightTrend.Change?,
    weighedDays: Int,
    private val intake: LoggedIntake,
) {
    // A change needs a reading at the window's start to be measured *from*; it is null
    // without one, which is short history rather than an unweighed window — a User
    // weighing daily has it until their readings reach back a fortnight.
    private val hasAnchor = trendChange != null
    private val weighingCovers = weighedDays >= MIN_WEIGHED_DAYS
    private val intakeUsable = intake.loggedDays >= MIN_LOGGED_DAYS && intake.totalKcal > 0.0

    /** The change the correction is read from, once every floor is cleared. */
    private val adaptableChange = trendChange?.takeIf { weighingCovers && intakeUsable }

    val canAdapt: Boolean get() = adaptableChange != null

    /**
     * The adaptive estimate over this window, or null when it cannot adapt or the
     * balance is refused (ADR 0031). The two terms' divisors are [Maintenance.adaptive]'s
     * business — this hands over the raw totals and divides nothing (ADR 0018).
     */
    fun adapt(basalMetabolicRateKcal: Double): Maintenance? = adaptableChange?.let {
        Maintenance.adaptive(intake, it, ADAPTIVE_WINDOW_DAYS, basalMetabolicRateKcal)
    }

    /**
     * Which condition held a review, so the badge can name the one thing that would
     * lift it (ADR 0031).
     *
     * These conditions co-occur — every new User's second review fails the logging floor
     * *and* has no anchor — so the order decides what one sentence on `/` says, and it
     * names the condition that is actually **binding**: the one still unmet when the
     * others are met.
     *
     * The anchor therefore leads the three floors, because it is the only one the User
     * cannot act on at all. Nothing done today produces one, and a week of perfect
     * logging lifts nothing while it is missing. Naming the logging floor there would
     * accuse a User who has logged every day they have existed, and promise a remedy that
     * cannot work. Between the two that *can* be acted on, the logging floor is the larger
     * ask and the later to clear, so it outranks a single weigh-in.
     *
     * [canAdapt] leads outright: reaching here with it true means the balance ran and the
     * domain refused the figure it produced, so no floor is what held this review.
     */
    fun holdReason(): Maintenance.HeldReason = when {
        canAdapt -> Maintenance.HeldReason.BELOW_BASAL_RATE
        !hasAnchor -> Maintenance.HeldReason.NO_WINDOW_ANCHOR
        !intakeUsable -> Maintenance.HeldReason.THIN_LOG
        !weighingCovers -> Maintenance.HeldReason.UNWEIGHED_WINDOW
        // [canAdapt] is exactly the conjunction of the three floors above, so nothing
        // reaches here. Refused rather than picking a reason by elimination, which would
        // silently mislabel the day a fourth floor is added.
        else -> error("no coverage floor failed, yet the review did not adapt")
    }

    companion object {
        /** The review window for the adaptive Maintenance correction. */
        const val ADAPTIVE_WINDOW_DAYS = 14L

        /**
         * Minimum logged days in the window before the adaptive correction is trusted
         * (ADR 0018). Below it the prior maintenance is held, so a thin, noisy sample
         * can't set the Budget.
         */
        const val MIN_LOGGED_DAYS = 10

        /**
         * Minimum weighed days in the window, the [MIN_LOGGED_DAYS] of the weight term
         * (ADR 0018). Far lower because the two terms fail differently: a thin intake
         * sample makes the level swing, while a window the scale never saw contributes
         * nothing at all and leaves Maintenance at the intake average exactly. One
         * reading is the negation of that, and the divisor floor already bounds how much
         * noise it can carry.
         */
        const val MIN_WEIGHED_DAYS = 1
    }
}
