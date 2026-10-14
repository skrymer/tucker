import { describe, expect, it } from 'vitest'
import { appTemplates } from '../../test/templates'

// An edit or delete icon on a row is one control wherever it appears: the same
// low-emphasis neutral ghost, at the same tap target. Restyled per screen, the
// same action read green in one place and grey in the next.

/**
 * A self-closing UButton — so icon-only, with no label. Its attributes may hold
 * a `>` (an arrow function), so it runs to the first `/>` before any other tag.
 */
const SELF_CLOSING_BUTTON = /<UButton\b(?:(?!<|\/>)[\s\S])*\/>/g
const EDIT_OR_DELETE_ICON = /\bicon="i-lucide-(?:pencil|trash-2)"/

describe('edit and delete row actions', () => {
  it('are all drawn by RowActionButton, never a UButton styled per screen', () => {
    const restyled = appTemplates().flatMap(({ file, source }) =>
      [...source.matchAll(SELF_CLOSING_BUTTON)]
        .map(([tag]) => tag!)
        .filter((tag) => EDIT_OR_DELETE_ICON.test(tag))
        .map((tag) => `${file}: ${tag.split(/\s+/).join(' ')}`),
    )

    expect(restyled).toEqual([])
  })
})
