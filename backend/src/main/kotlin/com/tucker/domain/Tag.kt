package com.tucker.domain

/**
 * A Tag's name: trimmed, 1–30 characters, kept as the User spelled it. Equal to, and
 * ordered with, another name ignoring case across the whole of Unicode — which SQLite's
 * NOCASE and `lower()` do not, as they fold ASCII alone.
 */
class TagName(given: String) : Comparable<TagName> {
    val value: String = given.trim()

    init {
        require(value.isNotEmpty()) { "a Tag name must not be blank" }
        require(value.length <= MAX_LENGTH) { "a Tag name must be at most $MAX_LENGTH characters" }
    }

    private val folded: String get() = value.lowercase()

    override fun equals(other: Any?): Boolean = other is TagName && other.folded == folded

    override fun hashCode(): Int = folded.hashCode()

    override fun compareTo(other: TagName): Int = folded.compareTo(other.folded)

    override fun toString(): String = value

    companion object {
        const val MAX_LENGTH = 30
    }
}

/**
 * A named grouping a User keeps of their own Foods (CONTEXT.md, **Tag**). A thing in
 * its own right rather than a word on a Food, so it outlives the last Food carrying it.
 */
data class Tag(val id: Long?, val name: TagName) {

    /**
     * This Tag renamed to [name] — or, when another of the User's [owned] Tags already
     * has that name in any case, merged into that one, whose spelling is kept (ADR 0033).
     * A respelling of this Tag's own name is a rename.
     */
    fun renamedTo(name: TagName, owned: Collection<Tag>): TagRename =
        owned.firstOrNull { it.id != id && it.name == name }?.let { TagRename.Merged(into = it) }
            ?: TagRename.Renamed(copy(name = name))
}

/** What renaming a Tag came to: the Tag under its new name, or the Tag it merged into. */
sealed interface TagRename {
    /** The Tag that remains. */
    val survivor: Tag

    data class Renamed(val tag: Tag) : TagRename {
        override val survivor get() = tag
    }

    data class Merged(val into: Tag) : TagRename {
        override val survivor get() = into
    }
}
