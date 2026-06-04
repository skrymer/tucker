import { describe, expect, it, vi } from 'vitest'
import { useAsyncAction } from './useAsyncAction'

describe('useAsyncAction', () => {
  it('runs the action and resolves with its result, passing an AbortSignal', async () => {
    const action = vi.fn(async (signal: AbortSignal) => {
      expect(signal).toBeInstanceOf(AbortSignal)
      return 'done'
    })
    const { run } = useAsyncAction(action)

    await expect(run()).resolves.toBe('done')
    expect(action).toHaveBeenCalledOnce()
  })

  it('is pending the instant work starts and settled once it resolves', async () => {
    let resolve!: (v: string) => void
    const { pending, run } = useAsyncAction(
      () => new Promise<string>((r) => (resolve = r)),
    )

    expect(pending.value).toBe(false)
    const done = run()
    expect(pending.value).toBe(true)
    resolve('ok')
    await done
    expect(pending.value).toBe(false)
  })

  it('keeps busy false when the action settles before the delay (anti-flicker)', async () => {
    vi.useFakeTimers()
    try {
      let resolve!: (v: string) => void
      const { busy, run } = useAsyncAction(
        () => new Promise<string>((r) => (resolve = r)),
        { delayMs: 150 },
      )

      const done = run()
      await vi.advanceTimersByTimeAsync(100)
      expect(busy.value).toBe(false)
      resolve('ok')
      await done
      expect(busy.value).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('flips busy true once the delay elapses while still pending', async () => {
    vi.useFakeTimers()
    try {
      let resolve!: (v: string) => void
      const { busy, run } = useAsyncAction(
        () => new Promise<string>((r) => (resolve = r)),
        { delayMs: 150 },
      )

      const done = run()
      await vi.advanceTimersByTimeAsync(150)
      expect(busy.value).toBe(true)
      resolve('ok')
      await done
    } finally {
      vi.useRealTimers()
    }
  })

  it('holds busy for at least minBusyMs once shown, without delaying the result', async () => {
    vi.useFakeTimers()
    try {
      let resolve!: (v: string) => void
      const { busy, run } = useAsyncAction(
        () => new Promise<string>((r) => (resolve = r)),
        { delayMs: 150, minBusyMs: 400 },
      )

      const done = run()
      await vi.advanceTimersByTimeAsync(150)
      expect(busy.value).toBe(true)

      // Action settles right after the spinner appears: the caller gets the
      // result now, but the spinner must not strobe away.
      resolve('ok')
      await expect(done).resolves.toBe('ok')
      expect(busy.value).toBe(true)

      await vi.advanceTimersByTimeAsync(400)
      expect(busy.value).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('guards re-entry by default: a second run while pending is ignored', async () => {
    let resolve!: () => void
    const action = vi.fn(() => new Promise<void>((r) => (resolve = r)))
    const { run } = useAsyncAction(action)

    const first = run()
    run()
    expect(action).toHaveBeenCalledTimes(1)
    resolve()
    await first
  })

  it('mode latest supersedes: it aborts the prior run and discards its stale result', async () => {
    const resolvers: Array<(v: string) => void> = []
    const signals: AbortSignal[] = []
    const action = vi.fn((signal: AbortSignal) => {
      signals.push(signal)
      return new Promise<string>((r) => resolvers.push(r))
    })
    const { run } = useAsyncAction(action, { mode: 'latest' })

    const first = run()
    const second = run()

    // The newer lookup wins: the first is aborted, the second runs.
    expect(action).toHaveBeenCalledTimes(2)
    expect(signals[0]!.aborted).toBe(true)
    expect(signals[1]!.aborted).toBe(false)

    // Even if the superseded request still resolves, its value is discarded.
    resolvers[0]!('stale')
    resolvers[1]!('fresh')
    await expect(second).resolves.toBe('fresh')
    await expect(first).resolves.toBeUndefined()
  })

  it('cancel() aborts the in-flight run, clears pending, and discards the result', async () => {
    const signals: AbortSignal[] = []
    let resolve!: (v: string) => void
    const action = vi.fn((signal: AbortSignal) => {
      signals.push(signal)
      return new Promise<string>((r) => (resolve = r))
    })
    const { pending, run, cancel } = useAsyncAction(action, { mode: 'latest' })

    const first = run()
    expect(pending.value).toBe(true)

    cancel()
    expect(signals[0]!.aborted).toBe(true)
    expect(pending.value).toBe(false)

    resolve('late')
    await expect(first).resolves.toBeUndefined()
  })

  it('aborts a hung action after timeoutMs and resolves undefined', async () => {
    vi.useFakeTimers()
    try {
      const signals: AbortSignal[] = []
      const action = vi.fn((signal: AbortSignal) => {
        signals.push(signal)
        // Never settles on its own — only the timeout can end it.
        return new Promise<string>(() => {})
      })
      const { run } = useAsyncAction(action, { timeoutMs: 8000 })

      const done = run()
      await vi.advanceTimersByTimeAsync(8000)

      expect(signals[0]!.aborted).toBe(true)
      await expect(done).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})
