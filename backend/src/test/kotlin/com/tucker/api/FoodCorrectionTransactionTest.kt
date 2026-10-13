package com.tucker.api

import com.fasterxml.jackson.databind.ObjectMapper
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
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.transaction.support.TransactionSynchronizationManager
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

/**
 * A correction and the Recipes it re-rolls are one write: the Food's row and every
 * Recipe's row are updated inside one transaction, so a Recipe can never be left on
 * figures the Food no longer has. A transaction is told apart by the resources bound
 * to it, not by its name — every repository write is transactional under its own
 * method's name, so two separate ones would share it. Not `@Transactional`, for the
 * reason [FrequentFoodsReadTransactionTest] gives, so it writes as a User of its own
 * and deletes what it made.
 */
@SpringBootTest
@AutoConfigureMockMvc
class FoodCorrectionTransactionTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var recorder: WriteRecorder

    private val cook = AccessTokens.mint(email = "food-corrector@tucker.invalid")

    @Test
    fun `a correction updates the Food and the Recipes it is in inside one transaction`() {
        val mince = idOf(
            post(
                "/api/foods",
                """{"name":"Mince","proteinPer100g":31.0,"carbsPer100g":0.0,"fatPer100g":10.0,"tagIds":[]}""",
            ),
        )
        val stew = idOf(
            post(
                "/api/recipes",
                """{"name":"Stew","cookedWeightG":300.0,"ingredients":[{"foodId":$mince,"grams":300.0}],"tagIds":[]}""",
            ),
        )

        try {
            recorder.updates.clear()
            mockMvc.put("/api/foods/$mince") {
                header(ACCESS_ASSERTION_HEADER, cook)
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Mince","proteinPer100g":13.0,"carbsPer100g":0.0,"fatPer100g":10.0,"tagIds":[]}"""
            }.andExpect { status { isOk() } }

            val updates = recorder.updates.toList()
            assertEquals(2, updates.size, "the Food and its one Recipe are each updated: $updates")
            assertNotNull(updates.first().transaction, "the updates run in a transaction: $updates")
            assertEquals(1, updates.map { it.transaction }.distinct().size, "in one transaction: $updates")
        } finally {
            mockMvc.delete("/api/foods/$stew") { header(ACCESS_ASSERTION_HEADER, cook) }
            mockMvc.delete("/api/foods/$mince") { header(ACCESS_ASSERTION_HEADER, cook) }
        }
    }

    private fun post(path: String, body: String): String = mockMvc.post(path) {
        header(ACCESS_ASSERTION_HEADER, cook)
        contentType = MediaType.APPLICATION_JSON
        content = body
    }.andExpect { status { isCreated() } }.andReturn().response.contentAsString

    private fun idOf(json: String): Long = objectMapper.readTree(json).get("id").asLong()

    @TestConfiguration
    class RecordWrites {
        @Bean fun writeRecorder() = WriteRecorder()

        @Bean fun writeListener(recorder: WriteRecorder): ExecuteListenerProvider =
            DefaultExecuteListenerProvider(recorder)
    }

    /** One UPDATE of a `food` row, and the identity of the transaction it ran in, if any. */
    data class Update(val sql: String, val transaction: Int?)

    /** Every UPDATE of a `food` row jOOQ executes, with the transaction bound around it. */
    class WriteRecorder : ExecuteListener {
        val updates = mutableListOf<Update>()

        override fun executeStart(ctx: ExecuteContext) {
            val sql = ctx.sql() ?: return
            if (!sql.lowercase().startsWith("update food ")) return
            // A new transaction binds a new connection holder, even on a pooled connection.
            val bound = TransactionSynchronizationManager.getResourceMap().values.firstOrNull()
            val transaction = bound?.takeIf { TransactionSynchronizationManager.isActualTransactionActive() }
            updates += Update(sql, transaction?.let { System.identityHashCode(it) })
        }
    }
}
