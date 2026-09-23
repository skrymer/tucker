const ROW_LIMIT = 5

/**
 * The Tags a catalog row shows whole, and how many a `+N` stands for: up to five
 * whole, else four and the count — a `+1` would take the room of the Tag it hides.
 */
export function rowTags<T>(tags: T[]): { shown: T[]; hidden: number } {
  if (tags.length <= ROW_LIMIT) return { shown: tags, hidden: 0 }
  const shown = tags.slice(0, ROW_LIMIT - 1)
  return { shown, hidden: tags.length - shown.length }
}
