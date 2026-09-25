/**
 * What Kotlin's `trim()` strips, which is what the server's `TagName` trims:
 * `Char.isWhitespace` — the ASCII controls tab through carriage return, the
 * separators U+001C–U+001F, and every Unicode space, line and paragraph
 * separator. Unlike JavaScript's `trim`, it keeps U+FEFF.
 */
const SERVER_TRIMMED =
  '\\t\\n\\u000B\\f\\r\\u001C-\\u001F \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000'
const EDGES = new RegExp(`^[${SERVER_TRIMMED}]+|[${SERVER_TRIMMED}]+$`, 'g')

/**
 * A Tag name as the server identifies it: trimmed as `TagName` trims, then
 * case-folded. Two names with one key are one Tag.
 */
export function tagNameKey(name: string): string {
  return name.replace(EDGES, '').toLowerCase()
}
