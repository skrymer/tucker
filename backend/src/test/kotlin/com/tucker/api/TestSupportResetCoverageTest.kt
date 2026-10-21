package com.tucker.api

import com.tucker.jooq.DefaultSchema
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
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional
import kotlin.test.assertEquals

/**
 * Closed-world over what the reset *deletes*, not over what is left: most tables are
 * already empty in the fast suite, so an emptiness check stays green on a reset that
 * forgets one. A table added later is reset unless it is named here as kept.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("smoke")
@Transactional
class TestSupportResetCoverageTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var recorder: DeleteRecorder

    @Test
    fun `a reset deletes from every table but the installation-wide ones`() {
        recorder.tables.clear()

        mockMvc.post("/api/test/reset").andExpect { status { isNoContent() } }

        val expected = DefaultSchema.DEFAULT_SCHEMA.tables.map { it.name }.toSet() - INSTALLATION_WIDE
        assertEquals(expected, recorder.tables.toSet())
    }

    @TestConfiguration
    class RecordDeletes {
        @Bean fun deleteRecorder() = DeleteRecorder()

        @Bean fun deleteListener(recorder: DeleteRecorder): ExecuteListenerProvider =
            DefaultExecuteListenerProvider(recorder)
    }

    /** The table each `DELETE FROM` jOOQ executes names (jOOQ renders SQLite identifiers unquoted). */
    class DeleteRecorder : ExecuteListener {
        val tables = mutableListOf<String>()

        override fun executeStart(ctx: ExecuteContext) {
            val sql = ctx.sql()?.lowercase() ?: return
            DELETE_FROM.find(sql)?.let { tables += it.groupValues[1].trim('"', '`') }
        }
    }

    private companion object {
        val DELETE_FROM = Regex("""^delete from ["`]?(\w+)["`]?""")

        /** Seeded by migrations or bootstrapped by the app, and the same for everybody. */
        val INSTALLATION_WIDE = setOf(
            "app_config",
            "id_sequence",
            "nutrient_reference_value",
            "reference_food",
            "reference_food_synonym",
        )
    }
}
