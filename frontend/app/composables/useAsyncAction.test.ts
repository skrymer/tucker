import { describe, expect, it, vi } from 'vitest'
import { useAsyncAction } from './useAsyncAction'

describe('useAsyncAction', () => {
  it('runs the action and resolves with its result, passing an AbortSignal', async () => {
    const action = vi.fn(async (signal: AbortSignal) => {
      expect(signal).toBeInstanceOf(AbortSignal)
      return 'done'
    })
    const { run } = useAsyncAction(action)

    await expect(run()).resolves.toEqual({ status: 'ok', value: 'done' })
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
      await expect(done).resolves.toEqual({ status: 'ok', value: 'ok' })
      expect(busy.value).toBe(true)

      await vi.advanceTimersByTimeAsync(400)
      expect(busy.value).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps busy shown when a superseded run is still holding it and a newer run is in flight', async () => {
    vi.useFakeTimers()
    try {
      const resolvers: Array<(v: string) => void> = []
      const action = vi.fn(() => new Promise<string>((r) => resolvers.push(r)))
      const { busy, run } = useAsyncAction(action, {
        mode: 'latest',
        delayMs: 150,
        minBusyMs: 400,
      })

      const first = run()
      await vi.advanceTimersByTimeAsync(150)
      expect(busy.value).toBe(true)

      // The first run settles a moment after its spinner showed, so its hold
      // still has 300ms to go.
      await vi.advanceTimersByTimeAsync(100)
      resolvers[0]!('first')
      await first

      // A newer run takes over while that hold is still outstanding, and its own
      // delay elapses — so the spinner on screen is now the newer run's.
      run()
      expect(action).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(150)

      // The superseded run's hold now falls due, and it no longer owns the
      // spinner — the run still in flight does.
      await vi.runOnlyPendingTimersAsync()
      expect(busy.value).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('lets the newer run take the inherited spinner down on its own hold', async () => {
    vi.useFakeTimers()
    try {
      const resolvers: Array<(v: string) => void> = []
      const action = vi.fn(() => new Promise<string>((r) => resolvers.push(r)))
      const { busy, run } = useAsyncAction(action, {
        mode: 'latest',
        delayMs: 150,
        minBusyMs: 400,
      })

      const first = run()
      await vi.advanceTimersByTimeAsync(250)
      resolvers[0]!('first')
      await first

      // The newer run inherits a spinner it did not raise, and finishes while
      // still holding it.
      const second = run()
      await vi.advanceTimersByTimeAsync(250)
      resolvers[1]!('second')
      await second
      expect(busy.value).toBe(true)

      // Ownership has to cut both ways: the run that owns the spinner is also
      // the one that must eventually release it — on the floor of the spinner
      // it inherited, due at 550ms, not the 800ms it would be had its own
      // delay restarted the clock.
      await vi.advanceTimersByTimeAsync(49)
      expect(busy.value).toBe(true)
      await vi.advanceTimersByTimeAsync(1)
      expect(busy.value).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('holds an inherited spinner for the rest of the episode, not from when the newer run started', async () => {
    vi.useFakeTimers()
    try {
      const resolvers: Array<(v: string) => void> = []
      const action = vi.fn(() => new Promise<string>((r) => resolvers.push(r)))
      const { busy, run } = useAsyncAction(action, {
        mode: 'latest',
        delayMs: 150,
        minBusyMs: 400,
      })

      const first = run()
      await vi.advanceTimersByTimeAsync(150)
      // The spinner is on screen from here: the episode's 400ms floor runs to
      // 550ms, whichever run happens to own it along the way.
      expect(busy.value).toBe(true)

      await vi.advanceTimersByTimeAsync(50)
      const second = run()
      await expect(first).resolves.toEqual({ status: 'superseded' })

      // The newer run settles inside its own 150ms delay, so it never raised a
      // spinner of its own — it inherited one that has been up for 100ms.
      await vi.advanceTimersByTimeAsync(50)
      resolvers[1]!('second')
      await second

      await vi.advanceTimersByTimeAsync(299)
      expect(busy.value).toBe(true)
      await vi.advanceTimersByTimeAsync(1)
      expect(busy.value).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('holds the spinner floor for a run that starts while an earlier one is still lingering', async () => {
    vi.useFakeTimers()
    try {
      const resolvers: Array<(v: string) => void> = []
      const action = vi.fn(() => new Promise<string>((r) => resolvers.push(r)))
      // Default `guard` mode: the floor belongs to the spinner, so inheriting it
      // does not depend on a newer run having superseded anything.
      const { busy, run } = useAsyncAction(action, {
        delayMs: 150,
        minBusyMs: 400,
      })

      const first = run()
      await vi.advanceTimersByTimeAsync(200)
      resolvers[0]!('first')
      await first
      // `pending` clears the instant the result lands while the spinner lingers,
      // so the next run is free to start and takes the spinner over.
      expect(busy.value).toBe(true)

      await vi.advanceTimersByTimeAsync(50)
      const second = run()
      expect(action).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(50)
      resolvers[1]!('second')
      await second

      await vi.advanceTimersByTimeAsync(249)
      expect(busy.value).toBe(true)
      await vi.advanceTimersByTimeAsync(1)
      expect(busy.value).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('never raises a spinner for a run that already finished inside the delay', async () => {
    vi.useFakeTimers()
    try {
      let resolve!: (v: string) => void
      const { busy, run } = useAsyncAction(
        () => new Promise<string>((r) => (resolve = r)),
        { delayMs: 150 },
      )

      const done = run()
      await vi.advanceTimersByTimeAsync(100)
      resolve('ok')
      await done

      // The delay belongs to a run that is over. Left armed it would raise a
      // spinner with nothing left to take it down.
      await vi.advanceTimersByTimeAsync(200)
      expect(busy.value).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('takes the spinner down with the result once the floor is fully spent', async () => {
    vi.useFakeTimers()
    try {
      let resolve!: (v: string) => void
      const { busy, run } = useAsyncAction(
        () => new Promise<string>((r) => (resolve = r)),
        { delayMs: 150, minBusyMs: 400 },
      )

      const done = run()
      // Shown at 150ms, so at 550ms the floor has run out to the millisecond.
      await vi.advanceTimersByTimeAsync(550)
      expect(busy.value).toBe(true)

      // Nothing left to hold and no timer to wait on — the ordinary case for
      // anything slower than half a second.
      resolve('ok')
      await done
      expect(busy.value).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves pending to the run still in flight when a superseded one settles', async () => {
    const resolvers: Array<(v: string) => void> = []
    const action = vi.fn(() => new Promise<string>((r) => resolvers.push(r)))
    const { pending, run } = useAsyncAction(action, { mode: 'latest' })

    const first = run()
    const second = run()
    await first

    // The superseded run must not resolve a lifecycle its successor owns, or
    // the control it drives goes live with work still outstanding.
    expect(pending.value).toBe(true)

    resolvers[1]!('fresh')
    await second
    expect(pending.value).toBe(false)
  })

  it('keeps a cancelled run superseded once a later run has started', async () => {
    const resolvers: Array<(v: string) => void> = []
    const action = vi.fn(() => new Promise<string>((r) => resolvers.push(r)))
    const { pending, run, cancel } = useAsyncAction(action, { mode: 'latest' })

    const first = run()
    cancel()
    const second = run()
    expect(action).toHaveBeenCalledTimes(2)

    // A cancelled run is orphaned for good. If a later run could take an id
    // that makes it current again it would report a timeout over the screen
    // that replaced it.
    await expect(first).resolves.toEqual({ status: 'superseded' })
    expect(pending.value).toBe(true)

    resolvers[1]!('fresh')
    await expect(second).resolves.toEqual({ status: 'ok', value: 'fresh' })
  })

  it('guards re-entry by default: a second run while pending is ignored', async () => {
    let resolve!: () => void
    const action = vi.fn(() => new Promise<void>((r) => (resolve = r)))
    const { run } = useAsyncAction(action)

    const first = run()
    // The bounced call says why it did nothing, so a caller can tell it apart
    // from work that failed.
    await expect(run()).resolves.toEqual({ status: 'superseded' })
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

    // Even if the superseded request still resolves, its value is discarded —
    // and it says *why*, so its caller knows to stay quiet rather than to
    // explain a failure that never happened.
    resolvers[0]!('stale')
    resolvers[1]!('fresh')
    await expect(second).resolves.toEqual({ status: 'ok', value: 'fresh' })
    await expect(first).resolves.toEqual({ status: 'superseded' })
  })

  it('discards a result that landed in the same tick as the run replacing it', async () => {
    const resolvers: Array<(v: string) => void> = []
    const action = vi.fn(() => new Promise<string>((r) => resolvers.push(r)))
    const { run } = useAsyncAction(action, { mode: 'latest' })

    const first = run()
    // The action has already resolved when the newer run takes over, so the
    // abort cannot unseat a value the race has latched on. The result belongs
    // to nobody all the same: something newer owns the screen.
    resolvers[0]!('landed')
    const second = run()

    await expect(first).resolves.toEqual({ status: 'superseded' })

    resolvers[1]!('fresh')
    await expect(second).resolves.toEqual({ status: 'ok', value: 'fresh' })
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

    // A cancelled run reads as superseded, not as a failure: the caller asked
    // for it to stop, so it has nothing to explain.
    resolve('late')
    await expect(first).resolves.toEqual({ status: 'superseded' })
  })

  it('tells a hung action apart from a superseded one when it aborts', async () => {
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
      // Not 'superseded': nothing newer took over, so the caller is the only one
      // who can explain the silence to the user (issue #164).
      await expect(done).resolves.toEqual({ status: 'timedOut' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports an action that failed with its own AbortError as a failure, not a cancellation', async () => {
    // A push service that cannot be reached rejects `pushManager.subscribe()`
    // with a bare AbortError. Nothing cancelled this run, so its caller has a
    // failure to explain rather than a silence to respect.
    const action = vi.fn(async () => {
      throw new DOMException(
        'Registration failed - push service error',
        'AbortError',
      )
    })
    const { run } = useAsyncAction(action)

    await expect(run()).rejects.toThrow(
      'Registration failed - push service error',
    )
  })
})
