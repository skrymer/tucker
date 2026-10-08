package com.tucker.api

import com.fasterxml.jackson.databind.ObjectMapper
import com.tucker.jooq.Tables.USER
import com.tucker.security.ACCESS_ASSERTION_HEADER
import com.tucker.security.AccessTokens
import org.jooq.DSLContext
import org.jooq.ExecuteContext
import org.jooq.ExecuteListener
import org.jooq.ExecuteListenerProvider
import org.jooq.impl.DefaultExecuteListenerProvider
import org.junit.jupiter.api.BeforeEach
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
import org.springframework.transaction.support.TransactionSynchronizationManager
import kotlin.test.assertEquals

/**
 * A create that cannot be refused once it has its id still draws that id in the
 * transaction that stores the row (ADR 0036), so a create commits once. Nothing a
 * response says shows that, so this watches the sequence's own statement. Not
 * `@Transactional`, or the test's transaction would be the one every statement saw;
 * each test removes what it created.
 */
@SpringBootTest
@AutoConfigureMockMvc
class IdDrawnInCreatesTransactionTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var draws: SequenceDraws
    @Autowired lateinit var dsl: DSLContext

    @BeforeEach
    fun forgetEarlierDraws() = draws.clear()

    @Test
    fun `creating a Tag draws its id inside the transaction that stores it`() {
        val json = mockMvc.post("/api/tags") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Drawn in one transaction"}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString

        mockMvc.delete("/api/tags/${objectMapper.readTree(json).get("id").asLong()}")
        assertEquals(listOf(true), draws.of("tag"), "the Tag's id was drawn in a commit of its own")
    }

    @Test
    fun `provisioning a newcomer draws their User id inside the transaction that stores them`() {
        val newcomer = "drawn-in-one-transaction@tucker.invalid"

        mockMvc.get("/api/foods") {
            header(ACCESS_ASSERTION_HEADER, AccessTokens.mint(email = newcomer))
        }.andExpect { status { isOk() } }

        dsl.deleteFrom(USER).where(USER.EMAIL.eq(newcomer)).execute()
        assertEquals(listOf(true), draws.of("user"), "the User's id was drawn in a commit of its own")
    }

    @TestConfiguration
    class RecordDraws {
        @Bean fun sequenceDraws() = SequenceDraws()

        @Bean fun drawListener(draws: SequenceDraws): ExecuteListenerProvider = DefaultExecuteListenerProvider(draws)
    }

    /**
     * For every id drawn from `id_sequence`, by the table it was drawn for, whether a
     * transaction was open around it — by table, because a request's first draw can be
     * the User its sign-in provisions rather than the row it creates.
     */
    class SequenceDraws : ExecuteListener {
        private val inTransaction = mutableListOf<Pair<Any?, Boolean>>()

        fun clear() = inTransaction.clear()

        fun of(table: String): List<Boolean> = inTransaction.filter { it.first == table }.map { it.second }

        override fun executeStart(ctx: ExecuteContext) {
            if (ctx.sql()?.lowercase()?.startsWith("update id_sequence") == true) {
                val table = ctx.query()?.bindValues?.last()
                inTransaction += table to TransactionSynchronizationManager.isActualTransactionActive()
            }
        }
    }
}
