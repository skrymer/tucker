import { describe, expect, it, vi } from 'vitest'
import { useOptionalFetch } from './useOptionalFetch'

describe('useOptionalFetch', () => {
  it('populates data from a successful fetch', async () => {
    const { data, load } = useOptionalFetch(() => Promise.resolve({ id: 1 }))

    await load()

    expect(data.value).toEqual({ id: 1 })
  })

  it('treats a 404 as an expected empty state, not an error', async () => {
    const notFound = Object.assign(new Error('Not Found'), { status: 404 })
    const { data, error, load } = useOptionalFetch(() =>
      Promise.reject(notFound),
    )

    await load()

    expect(data.value).toBeNull()
    expect(error.value).toBeNull()
  })

  it('surfaces a non-404 failure as an error', async () => {
    const serverError = Object.assign(new Error('Internal Server Error'), {
      status: 500,
    })
    const { data, error, load } = useOptionalFetch(() =>
      Promise.reject(serverError),
    )

    await load()

    expect(data.value).toBeNull()
    expect(error.value).toBe(serverError)
  })

  it('clears a previous error once a retry succeeds', async () => {
    const serverError = Object.assign(new Error('Internal Server Error'), {
      status: 500,
    })
    const fetcher = vi
      .fn<() => Promise<{ id: number }>>()
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce({ id: 1 })
    const { data, error, load } = useOptionalFetch(fetcher)

    await load()
    expect(error.value).toBe(serverError)

    await load()

    expect(error.value).toBeNull()
    expect(data.value).toEqual({ id: 1 })
  })

  it('ignores a second concurrent load() call while one is still in flight', async () => {
    let resolve!: (value: { id: number }) => void
    const fetcher = vi.fn(
      () => new Promise<{ id: number }>((r) => (resolve = r)),
    )
    const { load } = useOptionalFetch(fetcher)

    const first = load()
    const second = load()
    resolve({ id: 1 })
    await Promise.all([first, second])

    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('lets a newer load supersede an older one when each call asks a different question', async () => {
    const resolvers: ((value: { id: number }) => void)[] = []
    const fetcher = vi.fn(
      () => new Promise<{ id: number }>((r) => resolvers.push(r)),
    )
    const { data, load } = useOptionalFetch(fetcher, { mode: 'latest' })

    const first = load()
    const second = load()
    // The older answer lands last, which is the case a race would get wrong.
    resolvers[1]!({ id: 2 })
    resolvers[0]!({ id: 1 })
    await Promise.all([first, second])

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(data.value).toEqual({ id: 2 })
  })

  it('lets no superseded failure wipe the answer a newer load already painted', async () => {
    const settlers: {
      resolve: (value: { id: number }) => void
      reject: (reason: unknown) => void
    }[] = []
    const fetcher = vi.fn(
      () =>
        new Promise<{ id: number }>((resolve, reject) => {
          settlers.push({ resolve, reject })
        }),
    )
    const { data, error, load } = useOptionalFetch(fetcher, { mode: 'latest' })

    const first = load()
    const second = load()
    settlers[1]!.resolve({ id: 2 })
    settlers[0]!.reject(
      Object.assign(new Error('Internal Server Error'), { status: 500 }),
    )
    await Promise.all([first, second])

    expect(data.value).toEqual({ id: 2 })
    expect(error.value).toBeNull()
  })

  it('aborts the request it supersedes rather than leaving it to finish unread', async () => {
    const signals: AbortSignal[] = []
    const fetcher = vi.fn(
      (signal: AbortSignal) =>
        new Promise<{ id: number }>((resolve) => {
          signals.push(signal)
          signal.addEventListener('abort', () => resolve({ id: 0 }))
        }),
    )
    const { load } = useOptionalFetch(fetcher, { mode: 'latest' })

    void load()
    void load()

    // Cancelled, not merely ignored: on a slow link the connection is freed
    // rather than held open for an answer nothing will read (ADR 0007).
    expect(signals[0]!.aborted).toBe(true)
    expect(signals[1]!.aborted).toBe(false)
  })

  it('stays pending while the newest load is still out, whatever settled before it', async () => {
    const resolvers: ((value: { id: number }) => void)[] = []
    const fetcher = vi.fn(
      () => new Promise<{ id: number }>((r) => resolvers.push(r)),
    )
    const { pending, load } = useOptionalFetch(fetcher, { mode: 'latest' })

    const first = load()
    const second = load()
    resolvers[0]!({ id: 1 })
    await first

    // The superseded run is finished, but the page is not: reporting it idle
    // would take a spinner down over an answer that has not arrived.
    expect(pending.value).toBe(true)

    resolvers[1]!({ id: 2 })
    await second

    expect(pending.value).toBe(false)
  })
})
