import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useApiMutation } from './useApiMutation'

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

beforeEach(() => toastAdd.mockClear())

describe('useApiMutation', () => {
  it('is pending while the mutation runs and settled once it resolves', async () => {
    let resolve!: () => void
    const { pending, execute } = useApiMutation(
      () => new Promise<void>((r) => (resolve = r)),
      { errorTitle: 'Could not save' },
    )

    expect(pending.value).toBe(false)
    const done = execute()
    expect(pending.value).toBe(true)
    resolve()
    await done
    expect(pending.value).toBe(false)
  })

  it('ignores a second call while a mutation is still pending', async () => {
    let resolve!: () => void
    const mutate = vi.fn(() => new Promise<void>((r) => (resolve = r)))
    const { execute } = useApiMutation(mutate, { errorTitle: 'Could not save' })

    const first = execute()
    execute()
    expect(mutate).toHaveBeenCalledTimes(1)
    resolve()
    await first
  })

  it('runs onSuccess then shows the success toast when the mutation resolves', async () => {
    const calls: string[] = []
    const onSuccess = vi.fn(() => {
      calls.push('onSuccess')
    })
    toastAdd.mockImplementation(() => calls.push('toast'))
    const { execute } = useApiMutation(() => Promise.resolve(), {
      successTitle: 'Saved',
      errorTitle: 'Could not save',
      onSuccess,
    })

    await execute()

    expect(onSuccess).toHaveBeenCalledOnce()
    expect(calls).toEqual(['onSuccess', 'toast'])
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Saved', color: 'success' }),
    )
  })

  it('shows the error toast and skips onSuccess when the mutation rejects', async () => {
    const onSuccess = vi.fn()
    const { pending, execute } = useApiMutation(
      () => Promise.reject(new Error('boom')),
      { errorTitle: 'Could not save', onSuccess },
    )

    await execute()

    expect(onSuccess).not.toHaveBeenCalled()
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not save', color: 'error' }),
    )
    expect(pending.value).toBe(false)
  })
})
