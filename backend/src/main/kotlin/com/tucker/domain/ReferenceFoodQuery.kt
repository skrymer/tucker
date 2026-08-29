package com.tucker.domain

/**
 * The words a search of the Reference Foods is run with, after Australian retail
 * vernacular has been rewritten into the vocabulary FSANZ writes (ADR 0027).
 *
 * The synonym map is seeded data rather than code, and grown only on an observed
 * failure — a curated list is real ongoing debt, and one grown speculatively grows
 * without bound.
 */
data class ReferenceFoodQuery(val terms: List<String>) {

    /** Whether the words left nothing to search for. */
    val isEmpty: Boolean get() = terms.isEmpty()

    companion object {
        /**
         * Rewrite [text] into search terms, applying [synonyms] — whose keys may be
         * phrases, and whose values may be empty to drop a word entirely.
         *
         * Matched left to right, longest phrase first, and a replacement is never
         * re-examined: a rewrite that happened to produce another key would
         * otherwise cascade, and what the second rewrite did would depend on the
         * order the first two were declared in.
         */
        fun of(text: String, synonyms: Map<String, String>): ReferenceFoodQuery {
            val words = text.lowercase().split(NOT_A_WORD).filter { it.isNotEmpty() }
            // Split once, both sides: matching on the words and then rebuilding the
            // key to look the replacement back up would make the lookup depend on
            // rejoining exactly what was split.
            val rewrites = synonyms
                .map { (term, replacement) -> term.split(" ") to replacement.words() }
                .sortedByDescending { (phrase, _) -> phrase.size }
            val terms = mutableListOf<String>()
            var at = 0
            while (at < words.size) {
                val rewrite = rewrites.firstOrNull { (phrase, _) -> words.startsAt(at, phrase) }
                if (rewrite == null) {
                    terms += words[at]
                    at++
                } else {
                    terms += rewrite.second
                    at += rewrite.first.size
                }
            }
            return ReferenceFoodQuery(terms)
        }

        /** Punctuation and case carry no meaning here — FTS5 folds both away too. */
        private val NOT_A_WORD = Regex("[^a-z0-9]+")

        /** A replacement's words. Empty for a synonym that rewrites to nothing. */
        private fun String.words(): List<String> = split(" ").filter { it.isNotEmpty() }

        private fun List<String>.startsAt(at: Int, phrase: List<String>): Boolean =
            at + phrase.size <= size && phrase.indices.all { this[at + it] == phrase[it] }
    }
}
