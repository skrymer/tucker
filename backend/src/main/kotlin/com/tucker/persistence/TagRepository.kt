package com.tucker.persistence

import com.tucker.domain.Tag
import com.tucker.domain.TagName
import com.tucker.jooq.Tables.FOOD_TAG
import com.tucker.jooq.Tables.TAG
import com.tucker.security.CurrentUser
import org.jooq.DSLContext
import org.jooq.impl.DSL
import org.springframework.stereotype.Repository

/** A [Tag] and how many of the owner's Foods wear it. */
data class TagWithFoodCount(val tag: Tag, val foodCount: Int)

/** Persistence for [Tag], scoped to the current User like every owned row (ADR 0021). */
@Repository
class TagRepository(
    private val dsl: DSLContext,
    private val currentUser: CurrentUser,
) {

    /** The caller's Tags, alphabetically ignoring case (ADR 0033), each with its Food count. */
    fun findAllWithFoodCounts(): List<TagWithFoodCount> {
        val foodCount = DSL.count(FOOD_TAG.FOOD_ID)
        return dsl.select(TAG.ID, TAG.NAME, foodCount)
            .from(TAG)
            .leftJoin(FOOD_TAG).on(FOOD_TAG.TAG_ID.eq(TAG.ID))
            .where(TAG.USER_ID.eq(currentUser.ownerId))
            .groupBy(TAG.ID, TAG.NAME)
            .orderBy(TAG.NAME.lower())
            .fetch { TagWithFoodCount(Tag(it[TAG.ID]!!.toLong(), TagName(it[TAG.NAME]!!)), it[foodCount]) }
    }

    /**
     * The caller's Tag named [name] in any case, or null. Matched by [TagName]'s own
     * equality rather than in SQL, whose NOCASE folds ASCII alone.
     */
    fun findByName(name: TagName): TagWithFoodCount? =
        findAllWithFoodCounts().firstOrNull { it.tag.name == name }

    /** The caller's Tags among [ids]. A foreign id is simply not there (ADR 0021). */
    fun findByIds(ids: Collection<Long>): List<Tag> {
        if (ids.isEmpty()) return emptyList()
        return dsl.selectFrom(TAG)
            .where(TAG.ID.`in`(ids.map { it.toInt() }))
            .and(TAG.USER_ID.eq(currentUser.ownerId))
            .fetch { Tag(it.id!!.toLong(), TagName(it.name)) }
    }

    fun insert(name: TagName): Tag {
        val rec = dsl.newRecord(TAG)
        rec.userId = currentUser.ownerId
        rec.name = name.value
        rec.store()
        return Tag(rec.id!!.toLong(), name)
    }
}
