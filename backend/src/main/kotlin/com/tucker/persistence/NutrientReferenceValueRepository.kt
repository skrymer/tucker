package com.tucker.persistence

import com.tucker.domain.IntakeLimit
import com.tucker.domain.IntakeLimitKind
import com.tucker.domain.Micronutrient
import com.tucker.domain.NutrientReferenceValues
import com.tucker.domain.ReferenceIntake
import com.tucker.domain.ReferenceIntakeBand
import com.tucker.domain.Sex
import com.tucker.jooq.Tables.NUTRIENT_REFERENCE_VALUE
import org.jooq.DSLContext
import org.springframework.stereotype.Repository

/**
 * The seeded **Nutrient Reference Values** (V18, ADR 0027).
 *
 * Unscoped, like [ReferenceFoodRepository]: a published figure describes a body of
 * a given age and sex rather than one person's, so the table is global and unowned
 * (ADR 0021). Which band a **User** falls in is the domain's to resolve.
 *
 * Every band is read rather than the one in force being selected in SQL — there are
 * fewer than two hundred, and resolving in one place keeps the rule that a band is
 * in force until the next opens out of two languages.
 */
@Repository
class NutrientReferenceValueRepository(private val dsl: DSLContext) {

    fun all(): NutrientReferenceValues = NutrientReferenceValues(
        dsl.selectFrom(NUTRIENT_REFERENCE_VALUE)
            .fetch()
            .map { row ->
                ReferenceIntakeBand(
                    nutrient = Micronutrient.valueOf(row.nutrient),
                    sex = Sex.valueOf(row.sex),
                    fromAge = row.fromAge,
                    intake = ReferenceIntake(
                        recommended = row.recommended,
                        // Both columns or neither, which the table's own CHECK holds it to.
                        limit = row.limitAmount?.let {
                            IntakeLimit(it, IntakeLimitKind.valueOf(row.limitKind))
                        },
                    ),
                )
            },
    )
}
