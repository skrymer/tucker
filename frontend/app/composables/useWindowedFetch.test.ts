import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useWindowedFetch } from './useWindowedFetch'

describe('useWindowedFetch', () => {
  it('asks about the selection in force at the moment it loads', async () => {
    const fetcher = vi.fn(async (days: number) => ({ days }))
    const { selection, data, load } = useWindowedFetch<
      number,
      { days: number }
    >(28, fetcher)

    selection.value = 90
    await load()

    expect(data.value).toEqual({ days: 90 })
  })

  it('re-asks when the selection changes, without the caller saying so', async () => {
    const fetcher = vi.fn(async (days: number) => ({ days }))
    const { selection, data, load } = useWindowedFetch<
      number,
      { days: number }
    >(28, fetcher)
    await load()

    selection.value = 90
    await nextTick()
    await Promise.resolve()

    expect(data.value).toEqual({ days: 90 })
  })

  it('supersedes a load still in flight rather than dropping the new question', async () => {
    // Each call asks about a different window, so a load issued while one is in
    // flight is a new question — dropping it would leave the section describing
    // the window the User has just left.
    const answers: Record<number, (value: { days: number }) => void> = {}
    const fetcher = (days: number) =>
      new Promise<{ days: number }>((resolve) => {
        answers[days] = resolve
      })
    const { selection, data, load } = useWindowedFetch<
      number,
      { days: number }
    >(28, fetcher)

    const first = load()
    selection.value = 90
    await nextTick()

    // The wider window answers first, and the one it superseded answers after —
    // which is the ordering a stale run would clobber the screen in.
    answers[90]!({ days: 90 })
    answers[28]!({ days: 28 })
    await first
    await nextTick()

    expect(data.value).toEqual({ days: 90 })
  })

  it('aborts the load it supersedes rather than leaving it to finish unread', async () => {
    const signals: AbortSignal[] = []
    const fetcher = (days: number, signal: AbortSignal) => {
      signals.push(signal)
      return new Promise<{ days: number }>(() => {})
    }
    const { selection, load } = useWindowedFetch<number, { days: number }>(
      28,
      fetcher,
    )

    void load()
    selection.value = 90
    await nextTick()

    expect(signals[0]!.aborted).toBe(true)
    expect(signals[1]!.aborted).toBe(false)
  })
})
