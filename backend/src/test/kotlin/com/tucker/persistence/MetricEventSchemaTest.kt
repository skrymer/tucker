package com.tucker.persistence

import org.jooq.DSLContext
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import kotlin.test.assertEquals

/**
 * A metric is Tucker's, not a User's (ADR 0038): closed, so a column that could say who
 * sent one — a `user_id`, the raw user agent — fails here before it is ever written.
 */
@SpringBootTest
class MetricEventSchemaTest {

    @Autowired lateinit var dsl: DSLContext

    @Test
    fun `a stored metric has no column that could name the User who sent it`() {
        val columns = dsl.fetch("SELECT name FROM pragma_table_info('metric_event')")
            .map { it.get(0, String::class.java) }

        assertEquals(
            setOf("id", "kind", "route", "value_ms", "layout", "installed", "app_version", "recorded_at"),
            columns.toSet(),
        )
    }
}
