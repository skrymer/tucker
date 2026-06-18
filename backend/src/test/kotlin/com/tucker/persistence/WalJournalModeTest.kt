package com.tucker.persistence

import org.jooq.DSLContext
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import kotlin.test.assertEquals

@SpringBootTest
class WalJournalModeTest {

    @Autowired lateinit var dsl: DSLContext

    @Test
    fun `the running database is in WAL journal mode so Litestream can replicate it`() {
        val mode = dsl.fetchOne("PRAGMA journal_mode")?.get(0)?.toString()?.lowercase()

        assertEquals("wal", mode, "Litestream replicates the WAL; without WAL the off-host backup gets nothing")
    }
}
