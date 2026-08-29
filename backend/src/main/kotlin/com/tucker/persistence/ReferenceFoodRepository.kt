package com.tucker.persistence

import com.tucker.domain.Micronutrient
import com.tucker.domain.Micronutrients
import com.tucker.domain.ReferenceFood
import com.tucker.domain.ReferenceFoodCandidate
import com.tucker.domain.ReferenceFoodQuery
import com.tucker.jooq.Tables.REFERENCE_FOOD
import com.tucker.jooq.Tables.REFERENCE_FOOD_SYNONYM
import com.tucker.jooq.tables.records.ReferenceFoodRecord
import org.jooq.DSLContext
import org.springframework.stereotype.Repository

/**
 * Persistence for the Reference Foods and the index a User finds one through
 * (ADR 0027).
 *
 * Unscoped, alone among the repositories a request reaches: a Reference Food
 * describes a generic food rather than one person's, so it is global and unowned
 * like `app_config` (ADR 0021). The owned side of the borrow is
 * `food.reference_food_id`, which [FoodRepository] reads.
 *
 * [search] is plain SQL rather than jOOQ's DSL because there is nothing to generate
 * against: `MATCH`, `bm25` and `highlight` are FTS5's, and the search index is
 * excluded from codegen for that reason (`jooq-codegen.xml`).
 */
@Repository
class ReferenceFoodRepository(private val dsl: DSLContext) {

    /** Every Australian-vernacular rewrite V17 seeds, term to replacement. */
    fun synonyms(): Map<String, String> =
        dsl.select(REFERENCE_FOOD_SYNONYM.TERM, REFERENCE_FOOD_SYNONYM.REPLACEMENT)
            .from(REFERENCE_FOOD_SYNONYM)
            .fetch()
            .associate { it.value1() to it.value2() }

    /**
     * The name of every Reference Food in [ids], in one query — what the catalog
     * needs to say what each Food is matched *to* without asking per row.
     *
     * Its own projection rather than [findByIds] narrowed, deliberately: a catalog
     * subline wants two columns, and the whole row is nineteen `REAL`s beside them.
     */
    fun namesOf(ids: Collection<Long>): Map<Long, String> {
        if (ids.isEmpty()) return emptyMap()
        return dsl.select(REFERENCE_FOOD.ID, REFERENCE_FOOD.NAME)
            .from(REFERENCE_FOOD)
            .where(REFERENCE_FOOD.ID.`in`(ids.map { it.toInt() }))
            .fetch()
            .associate { it.value1()!!.toLong() to it.value2() }
    }

    fun findById(id: Long): ReferenceFood? = findByIds(listOf(id))[id]

    /**
     * The Reference Foods [query] reaches, best first, at most [limit] of them.
     *
     * Every term is required first, and only a query that reaches nothing that way
     * is widened to any of them. Requiring them keeps a long phrase from dragging in
     * every food sharing one common word, and widening is what stops
     * `coles free range chicken breast fillet` — a shopper reading a package aloud —
     * answering nothing at all.
     */
    fun search(query: ReferenceFoodQuery, limit: Int): List<ReferenceFoodCandidate> {
        if (query.isEmpty) return emptyList()
        val ranked = matching(query, "AND", limit).ifEmpty { matching(query, "OR", limit) }
        // The index ranks and the generated query fetches, in that order and never as
        // one statement: plain SQL gives jOOQ no metadata to type a column from, so it
        // takes SQLite's REAL as the Float the driver reports and hands a seeded 0.4
        // to the picker as 0.4000000059604645 (jooq-codegen.xml records the same
        // narrowing being forced away everywhere the DSL reaches).
        val byId = findByIds(ranked.map { it.id })
        return ranked.mapNotNull { hit ->
            byId[hit.id]?.let { ReferenceFoodCandidate(it, hit.namesTheWholeFood) }
        }
    }

    /** One hit of the search index: which Reference Food, and how much of it matched. */
    private data class Hit(val id: Long, val namesTheWholeFood: Boolean)

    private fun matching(query: ReferenceFoodQuery, operator: String, limit: Int): List<Hit> =
        // Every term is `[a-z0-9]+` by the time ReferenceFoodQuery is done with it,
        // so the quotes cannot be escaped out of.
        dsl.fetch(RANKED, query.terms.joinToString(" $operator ") { "\"$it\"" }, limit)
            .map {
                Hit(
                    id = it.get(REFERENCE_FOOD.ID.name, Long::class.java),
                    namesTheWholeFood = namesTheWholeFood(it.get(MATCHED_HEAD, String::class.java)),
                )
            }

    private fun findByIds(ids: List<Long>): Map<Long, ReferenceFood> {
        if (ids.isEmpty()) return emptyMap()
        return dsl.selectFrom(REFERENCE_FOOD)
            .where(REFERENCE_FOOD.ID.`in`(ids.map { it.toInt() }))
            .fetch()
            .associate { it.id!!.toLong() to it.toReferenceFood() }
    }

    private fun ReferenceFoodRecord.toReferenceFood() = ReferenceFood(
        id = id!!.toLong(),
        publicFoodKey = publicFoodKey,
        name = name,
        micronutrients = Micronutrients(
            mapOf(
                Micronutrient.FIBRE to fibreG,
                Micronutrient.CALCIUM to calciumMg,
                Micronutrient.IODINE to iodineUg,
                Micronutrient.IRON to ironMg,
                Micronutrient.MAGNESIUM to magnesiumMg,
                Micronutrient.POTASSIUM to potassiumMg,
                Micronutrient.SELENIUM to seleniumUg,
                Micronutrient.SODIUM to sodiumMg,
                Micronutrient.ZINC to zincMg,
                Micronutrient.VITAMIN_A to vitaminAUg,
                Micronutrient.THIAMIN to thiaminMg,
                Micronutrient.RIBOFLAVIN to riboflavinMg,
                Micronutrient.NIACIN to niacinMg,
                Micronutrient.VITAMIN_B6 to vitaminB6Mg,
                Micronutrient.VITAMIN_B12 to vitaminB12Ug,
                Micronutrient.FOLATE to folateUg,
                Micronutrient.VITAMIN_C to vitaminCMg,
                Micronutrient.VITAMIN_D to vitaminDUg,
                Micronutrient.VITAMIN_E to vitaminEMg,
            ),
        ),
    )

    private companion object {
        /**
         * Two answers at once, because both are ones only FTS5 can give.
         *
         * `bm25(f, 10.0, 1.0)` weights the head ten times the qualifiers, which is
         * what stops `Free-range eggs` returning `Bread, gluten free` on the word
         * *free*. It scores better the more negative it is, hence the plain
         * ascending sort.
         *
         * `highlight` marks the head's matched words, which is how a candidate
         * learns whether the query named the whole of it. FTS5 stems, so nothing
         * outside it can say which of a name's words a query actually reached.
         */
        val RANKED = """
            SELECT f.rowid AS id, highlight(reference_food_fts, 0, char(1), char(2)) AS matched_head
            FROM reference_food_fts f
            WHERE reference_food_fts MATCH ?
            ORDER BY bm25(reference_food_fts, 10.0, 1.0)
            LIMIT ?
        """.trimIndent()

        const val MATCHED_HEAD = "matched_head"

        /**
         * A word `highlight` marked as matched. The markers are control characters
         * rather than anything typographic because AFCD names carry `<`, `>`, `%`,
         * `~` and `&`, and a marker a name can contain reads as a match that never
         * happened.
         */
        val MATCHED_WORD = Regex("\\u0001[^\\u0002]*\\u0002")

        /**
         * Whether the query accounted for every word of a candidate's head — see
         * [ReferenceFoodCandidate]. Strike out what matched, and a letter or digit
         * left standing is a word of the food's name that the User never asked for.
         */
        fun namesTheWholeFood(matchedHead: String): Boolean =
            MATCHED_WORD.replace(matchedHead, "").none { it.isLetterOrDigit() }
    }
}
