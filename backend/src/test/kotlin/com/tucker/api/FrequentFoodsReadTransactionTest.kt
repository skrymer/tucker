package com.tucker.api

import com.fasterxml.jackson.databind.ObjectMapper
import com.tucker.domain.FrequentFoods
import com.tucker.security.WithTuckerUser
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
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.time.LocalDate
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The counts behind **Frequent Foods** and everything the tiles then say about the Foods
 * they name are one instant: every statement the read runs is inside one read-only
 * transaction. Deliberately not `@Transactional` — inside a test's own transaction every
 * statement shares one, and the request's boundary could not be seen.
 */
@SpringBootTest
@AutoConfigureMockMvc
@WithTuckerUser
class FrequentFoodsReadTransactionTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var recorder: TransactionRecorder

    // A window of its own: what this test logs is committed, and the suite's database
    // outlives the run, so it must not land in any other test's window.
    private val to = LocalDate.of(2001, 1, 31)
    private val from = to.minusDays(FrequentFoods.WINDOW_DAYS - 1L)

    @Test
    fun `the Frequent Foods and what their tiles say are read in one read-only transaction`() {
        val oats = idOf(
            mockMvc.post("/api/foods") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Rolled oats","proteinPer100g":13.0,"carbsPer100g":60.0,
                              "fatPer100g":7.0,"tagIds":[]}"""
            }.andExpect { status { isCreated() } }.andReturn().response.contentAsString,
        )
        val breakfast = idOf(
            mockMvc.post("/api/tags") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"breakfast ${UUID.randomUUID().toString().take(8)}"}"""
            }.andExpect { status { isCreated() } }.andReturn().response.contentAsString,
        )
        mockMvc.put("/api/foods/$oats/tags") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"tagIds":[$breakfast]}"""
        }.andExpect { status { isOk() } }
        mockMvc.post("/api/entries/weighed") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$to","foodId":$oats,"grams":100.0}"""
        }.andExpect { status { isCreated() } }

        recorder.reads.clear()
        mockMvc.get("/api/foods/frequent") {
            param("from", "$from")
            param("to", "$to")
        }.andExpect { status { isOk() } }

        val tagRead = recorder.reads.filter { (sql, _) -> sql.lowercase().startsWith("select tag.") }
        assertTrue(tagRead.isNotEmpty(), "expected the tiles' Tags to be read, recorded: ${recorder.reads}")
        // The caller's identity is resolved by the security filter before the request
        // reaches the read, so its lookup is no part of it.
        val read = recorder.reads.filterNot { (sql, _) -> sql.lowercase().contains(" from user ") }
        assertEquals(
            emptyList(),
            read.filterNot { (_, readOnly) -> readOnly }.map { it.first },
            "every statement of the read runs in its read-only transaction",
        )
    }

    private fun idOf(json: String): Long = objectMapper.readTree(json).get("id").asLong()

    @TestConfiguration
    class RecordTransactions {
        @Bean fun transactionRecorder() = TransactionRecorder()

        @Bean fun recordingListener(recorder: TransactionRecorder): ExecuteListenerProvider =
            DefaultExecuteListenerProvider(recorder)
    }

    /** Every statement jOOQ executes, and whether a read-only transaction was open around it. */
    class TransactionRecorder : ExecuteListener {
        val reads = mutableListOf<Pair<String, Boolean>>()

        override fun executeStart(ctx: ExecuteContext) {
            val sql = ctx.sql() ?: return
            reads += sql to TransactionSynchronizationManager.isCurrentTransactionReadOnly()
        }
    }
}
