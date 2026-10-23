package com.tucker.api

import com.tucker.persistence.LinkTableOwnerPredicateTest.RecordStatements
import com.tucker.persistence.LinkTableOwnerPredicateTest.StatementRecorder
import com.tucker.security.ACCESS_ASSERTION_HEADER
import com.tucker.security.AccessTokens
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.transaction.annotation.Transactional
import kotlin.test.assertEquals

/**
 * With no version chosen, the report and each release's figures are drawn from the same
 * moves, so the moves are read once.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@Import(RecordStatements::class)
class AdminMetricsReadCountTest {

    @Autowired lateinit var mockMvc: MockMvc

    @Autowired lateinit var recorder: StatementRecorder

    @Test
    fun `reads the moves once when no app version is chosen`() {
        recorder.statements.clear()

        mockMvc.get("/api/admin/metrics") {
            header(ACCESS_ASSERTION_HEADER, AccessTokens.mint(email = "admin@tucker.invalid"))
        }.andExpect { status { isOk() } }

        val movesRead = recorder.statements.map { it.lowercase() }
            .filter { it.startsWith("select") && "from metric_event" in it && "group by" !in it }
        assertEquals(1, movesRead.size, "the moves were read ${movesRead.size} times: $movesRead")
    }
}
