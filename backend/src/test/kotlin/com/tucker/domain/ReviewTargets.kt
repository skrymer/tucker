package com.tucker.domain

/**
 * The Intake Targets a review under test is expected to carry.
 *
 * A review run with Calorie Tracking off has none, so every assertion that reads
 * a Maintenance, a Calorie Budget or a Protein Floor off a review is also
 * asserting that tracking was on. Saying that once here keeps it out of the call
 * sites and makes the failure name the assumption rather than the line.
 */
val WeeklyReview.targets: IntakeTargets
    get() = requireNotNull(intakeTargets) {
        "expected the review of $reviewedOn to carry Intake Targets"
    }
