import { describe, expect, it } from 'vitest'
import { useExpander } from './useExpander'

describe('useExpander', () => {
  it('offers to show all of a capped list, naming how many there are', () => {
    const { expanded, label } = useExpander(12)

    expect(expanded.value).toBe(false)
    expect(label.value).toBe('Show all 12')
  })

  it('offers the way back once open, never only the way in', () => {
    const { expanded, label, toggle } = useExpander(12)

    toggle()
    expect(expanded.value).toBe(true)
    expect(label.value).toBe('Show less')

    toggle()
    expect(expanded.value).toBe(false)
    expect(label.value).toBe('Show all 12')
  })

  it('counts what the list holds now, not what it held when it was opened', () => {
    const total = ref(3)
    const { label } = useExpander(total)

    total.value = 5

    expect(label.value).toBe('Show all 5')
  })

  it('closes on demand, for a caller whose list has been replaced under it', () => {
    const { expanded, toggle, collapse } = useExpander(12)

    toggle()
    collapse()

    expect(expanded.value).toBe(false)
  })
})
