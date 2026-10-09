package com.tucker.api

import com.fasterxml.jackson.databind.ObjectMapper
import com.tucker.domain.FrequentFoods
import com.tucker.security.ACCESS_ASSERTION_HEADER
import com.tucker.security.AccessTokens
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
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The counts behind **Frequent Foods** and everything the tiles then say about the Foods
 * they name are one instant: every statement the read runs is inside one read-only
 * transaction. Deliberately not `@Transactional` — inside a test's own transaction every
 * statement shares one, and the request's boundary could not be seen. What it logs is
 * therefore committed, so it logs as a User of its own, which the suite's shared `tester`
 * never sees, and deletes it again.
 */
@SpringBootTest
@AutoConfigureMockMvc
class FrequentFoodsReadTransactionTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var recorder: TransactionRecorder

    private val reader = AccessTokens.mint(email = "frequent-reader@tucker.invalid")
    private val to = LocalDate.of(2026, 9, 6)
    private val from = to.minusDays(FrequentFoods.WINDOW_DAYS - 1L)

    @Test
    fun `the Frequent Foods and what their tiles say are read in one read-only transaction`() {
        val oats = idOf(
            mockMvc.post("/api/foods") {
                header(ACCESS_ASSERTION_HEADER, reader)
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Rolled oats","proteinPer100g":13.0,"carbsPer100g":60.0,
                              "fatPer100g":7.0,"tagIds":[]}"""
            }.andExpect { status { isCreated() } }.andReturn().response.contentAsString,
        )
        // Answers with the Tag a run that never reached its clean-up left, as well as
        // a new one, so either is fine here.
        val breakfast = idOf(
            mockMvc.post("/api/tags") {
                header(ACCESS_ASSERTION_HEADER, reader)
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"breakfast"}"""
            }.andReturn().response.contentAsString,
        )
        mockMvc.put("/api/foods/$oats/tags") {
            header(ACCESS_ASSERTION_HEADER, reader)
            contentType = MediaType.APPLICATION_JSON
            content = """{"tagIds":[$breakfast]}"""
        }.andExpect { status { isOk() } }
        val entry = idOf(
            mockMvc.post("/api/entries/weighed") {
                header(ACCESS_ASSERTION_HEADER, reader)
                contentType = MediaType.APPLICATION_JSON
                content = """{"date":"$to","foodId":$oats,"grams":100.0}"""
            }.andExpect { status { isCreated() } }.andReturn().response.contentAsString,
        )

        try {
            recorder.reads.clear()
            mockMvc.get("/api/foods/frequent") {
                header(ACCESS_ASSERTION_HEADER, reader)
                param("from", "$from")
                param("to", "$to")
            }.andExpect { status { isOk() } }

            assertReadInOneReadOnlyTransaction()
        } finally {
            mockMvc.delete("/api/entries/$entry") { header(ACCESS_ASSERTION_HEADER, reader) }
            mockMvc.delete("/api/foods/$oats") { header(ACCESS_ASSERTION_HEADER, reader) }
            mockMvc.delete("/api/tags/$breakfast") { header(ACCESS_ASSERTION_HEADER, reader) }
        }
    }

    private fun assertReadInOneReadOnlyTransaction() {
        assertTrue(
            recorder.reads.any { it.sql.lowercase().startsWith("select tag.") },
            "expected the tiles' Tags to be read, recorded: ${recorder.reads}",
        )
        // The caller's identity is resolved by the security filter before the request
        // reaches the read, so its lookup is no part of it.
        val read = recorder.reads.filterNot { IDENTITY.containsMatchIn(it.sql.lowercase()) }
        assertEquals(emptyList(), read.filterNot { it.readOnly }.map { it.sql }, "every statement is read-only")
        assertEquals(1, read.map { it.transaction }.distinct().size, "the read is one transaction: $read")
    }

    private fun idOf(json: String): Long = objectMapper.readTree(json).get("id").asLong()

    @TestConfiguration
    class RecordTransactions {
        @Bean fun transactionRecorder() = TransactionRecorder()

        @Bean fun recordingListener(recorder: TransactionRecorder): ExecuteListenerProvider =
            DefaultExecuteListenerProvider(recorder)
    }

    /** One statement jOOQ executed, and the transaction open around it, if any. */
    data class Read(val sql: String, val readOnly: Boolean, val transaction: String?)

    /** Every statement jOOQ executes, with the transaction open around it. */
    class TransactionRecorder : ExecuteListener {
        val reads = mutableListOf<Read>()

        override fun executeStart(ctx: ExecuteContext) {
            val sql = ctx.sql() ?: return
            reads += Read(
                sql = sql,
                readOnly = TransactionSynchronizationManager.isCurrentTransactionReadOnly(),
                transaction = TransactionSynchronizationManager.getCurrentTransactionName(),
            )
        }
    }

    private companion object {
        val IDENTITY = Regex("""\b(from|into) user\b""")
    }
}
