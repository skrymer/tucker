package com.tucker.persistence

import com.tucker.domain.TagName
import com.tucker.security.WithTuckerUser
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional
import kotlin.test.assertEquals

/** Persistence for **Tags**, where it holds a rule the controller cannot (ADR 0033). */
@SpringBootTest
@Transactional
@WithTuckerUser
class TagRepositoryTest {

    @Autowired lateinit var tags: TagRepository

    @Test
    fun `inserting a name another request has just created in another case returns that Tag`() {
        // The shape of two devices creating one name at once: both miss the lookup,
        // and the second insert meets the first's row.
        val first = tags.insert(TagName("breakfast"))

        val second = tags.insert(TagName("Breakfast"))

        assertEquals(first, second)
        assertEquals(1, tags.findAllWithFoodCounts().size)
    }
}
