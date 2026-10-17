import { describe, expect, it } from 'vitest'
import { appTemplates } from '../../test/templates'

// An edit or delete icon on a row is one control wherever it appears: the same
// low-emphasis neutral ghost, at the same tap target. Restyled per screen, the
// same action read green in one place and grey in the next.

/**
 * A UButton with no label: self-closing, or closed with nothing between. Its
 * attributes may hold a `>` (an arrow function), so it runs on to the first
 * `/>` or `></UButton>` that comes before any other tag.
 */
const ICON_ONLY_BUTTON =
  /<UButton\b(?:(?!<|\/>|>\s*<\/UButton>)[\s\S])*(?:\/>|>\s*<\/UButton>)/g

/** An edit or delete glyph named in an `icon` attribute, static or bound. */
const EDIT_OR_DELETE_ICON = /\bicon="[^"]*i-lucide-(?:pencil|square-pen|trash)/

/** Every icon-only edit or delete UButton in [source], as written. */
function restyledRowActions(source: string): string[] {
  return [...source.matchAll(ICON_ONLY_BUTTON)]
    .map(([tag]) => tag!)
    .filter((tag) => EDIT_OR_DELETE_ICON.test(tag))
}

describe('edit and delete row actions', () => {
  it('are all drawn by RowActionButton, never a UButton styled per screen', () => {
    const restyled = appTemplates()
      // The one place the treatment is written down.
      .filter(({ file }) => file !== 'components/RowActionButton.vue')
      .flatMap(({ file, source }) =>
        restyledRowActions(source).map(
          (tag) => `${file}: ${tag.split(/\s+/).join(' ')}`,
        ),
      )

    expect(restyled).toEqual([])
  })

  it.each([
    ['a static icon', '<UButton icon="i-lucide-trash-2" />'],
    ['a bound icon', `<UButton :icon="'i-lucide-pencil'" aria-label="Edit" />`],
    [
      'an icon bound by condition',
      `<UButton :icon="open ? 'i-lucide-pencil' : 'i-lucide-x'" />`,
    ],
    [
      'an empty open-and-close tag',
      '<UButton icon="i-lucide-trash-2"></UButton>',
    ],
    [
      'another pencil or trash glyph',
      '<UButton icon="i-lucide-square-pen" /><UButton icon="i-lucide-trash" />',
    ],
  ])('are caught when written as %s', (_, source) => {
    expect(restyledRowActions(source)).not.toEqual([])
  })

  it('leave a labelled edit or delete button alone', () => {
    expect(
      restyledRowActions(
        '<UButton icon="i-lucide-pencil" block>Edit recipe</UButton>',
      ),
    ).toEqual([])
  })
})
