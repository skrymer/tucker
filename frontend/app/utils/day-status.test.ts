import { describe, expect, it } from 'vitest'
import { designSection } from '../../test/designDoc'
import { dayStatusVerdict, type DayStatus } from './day-status'

// DESIGN.md's Status table says which verdict each status role is for; this is
// the executable link between it and the colour each verdict is drawn in.
describe("DESIGN.md's Status table", () => {
  const table = designSection('### Status (semantic, separate axis)')

  /** The Use cell of the row named [role], in plain words. */
  function useOf(role: string): string {
    const row = table.split('\n').find((line) => line.startsWith(`| ${role} `))
    return (row?.split('|')[3] ?? '').replace(/[*-]/g, ' ').toLowerCase()
  }

  it.each<DayStatus>(['on-target', 'slightly-over', 'over-budget'])(
    'names the %s verdict under the role it is drawn in',
    (status) => {
      const verdict = dayStatusVerdict(status)!
      const role = verdict.class.replace('text-', '')
      const name = role[0]!.toUpperCase() + role.slice(1)

      expect(useOf(name)).toContain(verdict.label.toLowerCase())
    },
  )
})

describe('dayStatusVerdict', () => {
  it('shows on target as a success verdict', () => {
    expect(dayStatusVerdict('on-target')).toEqual({
      label: 'On target',
      icon: 'i-lucide-circle-check',
      class: 'text-success',
    })
  })

  it('shows over budget as an error verdict', () => {
    expect(dayStatusVerdict('over-budget')).toEqual({
      label: 'Over budget',
      icon: 'i-lucide-circle-x',
      class: 'text-error',
    })
  })

  it('shows slightly over as a warning verdict with the alert icon', () => {
    expect(dayStatusVerdict('slightly-over')).toEqual({
      label: 'Slightly over',
      icon: 'i-lucide-circle-alert',
      class: 'text-warning',
    })
  })

  it('earns no verdict while the day is in progress', () => {
    expect(dayStatusVerdict('in-progress')).toBeNull()
  })

  it('earns no verdict before the first review, when the status is absent', () => {
    expect(dayStatusVerdict(null)).toBeNull()
    expect(dayStatusVerdict(undefined)).toBeNull()
  })
})
