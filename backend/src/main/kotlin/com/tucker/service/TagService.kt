package com.tucker.service

import com.tucker.api.NotFoundException
import com.tucker.domain.TagName
import com.tucker.domain.TagRename
import com.tucker.persistence.TagRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Renaming a Tag, which crosses aggregates when it merges: every Food carrying the
 * renamed Tag moves onto the one it merged into, in one transaction (ADR 0033).
 */
@Service
class TagService(private val tags: TagRepository) {

    /** Rename the caller's Tag [id] to [name], merging it where the User has that name. */
    @Transactional
    fun rename(id: Long, name: TagName): TagRename {
        val owned = tags.findAllWithFoodCounts().map { it.tag }
        val tag = owned.firstOrNull { it.id == id } ?: throw NotFoundException("no tag with id $id")
        val outcome = tag.renamedTo(name, owned)
        when (outcome) {
            is TagRename.Renamed -> tags.rename(outcome.tag)
            is TagRename.Merged -> tags.merge(from = id, into = checkNotNull(outcome.survivor.id))
        }
        return outcome
    }
}
