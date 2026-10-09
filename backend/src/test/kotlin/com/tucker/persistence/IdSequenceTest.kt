package com.tucker.persistence

import com.tucker.jooq.Tables.GOAL
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional
import kotlin.test.assertEquals

@SpringBootTest
@Transactional
class IdSequenceTest {

    @Autowired lateinit var ids: IdSequence

    @Test
    fun `each id handed out for a table is one past the last`() {
        val first = ids.next(GOAL)
        val second = ids.next(GOAL)

        assertEquals(first + 1, second, "two Goal ids in a row, one apart")
    }
}
