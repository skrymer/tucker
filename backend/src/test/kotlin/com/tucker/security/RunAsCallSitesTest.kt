package com.tucker.security

import org.junit.jupiter.api.Test
import java.io.File
import kotlin.test.assertEquals

/**
 * ADR 0021 permits exactly one production caller of [runAs]: the Weekly-Review
 * Reminder, which has no request to read a User from. Everywhere else the current
 * User is a fact *about the request*, and inventing one is precisely how the
 * isolation this slice builds would be undone — silently, since impersonated code
 * reads and writes perfectly happily.
 *
 * Both the ADR and `RunAs.kt` say a second call site "would be a review failure".
 * This makes that rule executable, because a reviewer noticing one new line in a
 * large diff is the weakest enforcement available for the one capability that can
 * defeat the whole design.
 *
 * No Gradle `inputs` declaration is needed (unlike `OpenApiSnapshotTest`, which
 * reads a file outside every source set): adding a call site necessarily changes
 * main's bytecode, which is already an input to `:test`.
 */
class RunAsCallSitesTest {

    @Test
    fun `only the reminder scheduler runs as another User`() {
        val callers = File(MAIN_SOURCES).walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            // RunAs.kt declares it, which is not calling it.
            .filterNot { it.name == DECLARATION }
            .filter { CALL in it.readText() }
            .map { it.name }
            .toSortedSet()

        assertEquals(
            sortedSetOf("ReminderScheduler.kt"),
            callers,
            "runAs establishes an identity out of thin air, so ADR 0021 confines it to " +
                "the one job that has no request behind it. A new caller here needs the " +
                "ADR changed first, not this assertion widened",
        )
    }

    private companion object {
        const val MAIN_SOURCES = "src/main/kotlin"
        const val DECLARATION = "RunAs.kt"

        /** The call, not a KDoc reference — those are written `[runAs]`. */
        const val CALL = "runAs("
    }
}
