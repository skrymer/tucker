package com.tucker.persistence

import com.tucker.jooq.DefaultSchema
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * jOOQ's SQLite dialect maps REAL to Float by default, which narrows every stored
 * decimal to 32 bits — a 107.05 trend weight reads back 107.05000305175781. The
 * `<forcedType>` in `jooq-codegen.xml` corrects the mapping in one place.
 *
 * `RepositoryRoundTripTest` proves the resulting *behaviour* for one column; this
 * proves the *rule* for all of them, and for any REAL column a future migration
 * adds without anyone rereading the codegen config.
 */
class StoredPrecisionTest {

    @Test
    fun `every stored decimal keeps full precision`() {
        val fields = DefaultSchema.DEFAULT_SCHEMA.tables.flatMap { it.fields().toList() }
        // A filter that finds nothing is green whether the rule holds or the schema
        // failed to generate, so prove there was something to scan.
        assertTrue(fields.isNotEmpty(), "no generated columns to check — did codegen run?")

        // javaObjectType, not ::class.java: the latter is the *primitive* float, which
        // never equals a jOOQ field type, so the filter would silently match nothing.
        val narrowed = fields
            .filter { it.type == Float::class.javaObjectType }
            .map { it.qualifiedName.toString() }

        assertEquals(emptyList(), narrowed)
    }
}
