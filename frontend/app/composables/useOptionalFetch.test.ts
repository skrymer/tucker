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
})
