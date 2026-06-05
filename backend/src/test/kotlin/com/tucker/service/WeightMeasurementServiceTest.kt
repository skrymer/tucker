package com.tucker.service

import com.tucker.domain.Goal
import com.tucker.domain.WeightMeasurement
import com.tucker.persistence.GoalRepository
import com.tucker.persistence.WeightMeasurementRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate
import kotlin.test.assertEquals

@SpringBootTest
@Transactional
class WeightMeasurementServiceTest {

    @Autowired lateinit var service: WeightMeasurementService
    @Autowired lateinit var weights: WeightMeasurementRepository
    @Autowired lateinit var goals: GoalRepository

    private val today = LocalDate.of(2026, 5, 29)

    @Test
    fun `recording a measurement that crosses target stamps the active goal as reached`() {
        // Trend sits at 80.4; a 76.0 reading pulls the EWMA to ~79.96, below the 80 target.
        weights.save(WeightMeasurement.recorded(today.minusDays(1), 80.4, today))
        goals.insert(Goal(null, today, 90.0, 80.0, 0.5, active = true))

        service.save(WeightMeasurement.recorded(today, 76.0, today), today)

        assertEquals(today, goals.findActive()!!.reachedOn)
    }
}
