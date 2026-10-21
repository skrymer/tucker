package com.tucker.api

import com.tucker.jooq.Tables.METRIC_EVENT
import com.tucker.security.ACCESS_ASSERTION_HEADER
import com.tucker.security.AccessTokens
import org.jooq.DSLContext
import org.jooq.ExecuteContext
import org.jooq.ExecuteListener
import org.jooq.ExecuteListenerProvider
import org.jooq.impl.DefaultExecuteListenerProvider
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import org.springframework.transaction.support.TransactionSynchronizationManager
import kotlin.test.assertEquals

/**
 * A batch is stored as one write (ADR 0038 refuses one whole, and stores one whole):
 * its insert runs inside a transaction, so SQLite commits it once rather than row by
 * row. Not `@Transactional`, whose own transaction would be the one observed, so it
 * deletes the rows it made under a route no other test sends.
 */
@SpringBootTest
@AutoConfigureMockMvc
class MetricBatchTransactionTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var dsl: DSLContext
    @Autowired lateinit var recorder: InsertRecorder

    @Test
    fun `a batch is inserted inside one transaction`() {
        val event = """{"kind":"route-change","route":"$ROUTE","valueMs":420,"layout":"phone",""" +
            """"installed":false,"appVersion":"1.4.0"}"""
        try {
            recorder.inTransaction.clear()
            mockMvc.post("/api/metrics") {
                header(ACCESS_ASSERTION_HEADER, AccessTokens.mint(email = "metric-sender@tucker.invalid"))
                contentType = MediaType.APPLICATION_JSON
                content = """{"events":[$event,$event,$event]}"""
            }.andExpect { status { isNoContent() } }

            assertEquals(listOf(true), recorder.inTransaction, "one insert, inside a transaction")
        } finally {
            dsl.deleteFrom(METRIC_EVENT).where(METRIC_EVENT.ROUTE.eq(ROUTE)).execute()
        }
    }

    @TestConfiguration
    class RecordInserts {
        @Bean fun insertRecorder() = InsertRecorder()

        @Bean fun insertListener(recorder: InsertRecorder): ExecuteListenerProvider =
            DefaultExecuteListenerProvider(recorder)
    }

    /** Whether each insert into `metric_event` ran with a transaction bound around it. */
    class InsertRecorder : ExecuteListener {
        val inTransaction = mutableListOf<Boolean>()

        override fun executeStart(ctx: ExecuteContext) {
            val sql = ctx.sql() ?: ctx.batchSQL().firstOrNull() ?: return
            if (!sql.lowercase().startsWith("insert into metric_event")) return
            inTransaction += TransactionSynchronizationManager.isActualTransactionActive()
        }
    }

    private companion object {
        const val ROUTE = "/metric-batch-transaction"
    }
}
