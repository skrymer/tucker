import { describe, expect, it } from 'vitest'
import { designSection } from '../../test/designDoc'
import { CONTENT_CARD_SUBJECTS } from './contentCard'

// A card's subject icon is stated twice: in the subject map, which is what
// renders, and in DESIGN.md's subject → icon table, which is what a developer
// reads before building a card. This is the executable link between them.

/** DESIGN.md's subject → icon table, as `subject key → icon name`. */
function documentedSubjects(): Record<string, string> {
  const rows = designSection('### Content card')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\| `[a-zA-Z]+` /.test(line))
  return Object.fromEntries(
    rows.map((row) => {
      const [, key, , icon] = row.split('|').map((cell) => cell.trim())
      return [key!.replaceAll('`', ''), icon!.replaceAll('`', '')]
    }),
  )
}

describe('the content card subjects', () => {
  it('draws each subject with the icon DESIGN.md names for it', () => {
    const drawn = Object.fromEntries(
      Object.entries(CONTENT_CARD_SUBJECTS).map(([key, icon]) => [
        key,
        icon.replace(/^i-lucide-/, ''),
      ]),
    )

    // Two empty tables agree too; the Goal is a subject on every carded page.
    expect(documentedSubjects()).toHaveProperty('goal')
    expect(drawn).toEqual(documentedSubjects())
  })

  it('types a subject as one of the map’s keys, so an unknown one does not compile', () => {
    // Checked by `pnpm typecheck`: the directive fails it if the line compiles.
    // @ts-expect-error — no such subject
    const unknown: ContentCardSubject = 'sleep'

    expect(CONTENT_CARD_SUBJECTS).not.toHaveProperty(unknown)
  })
})
