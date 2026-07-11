import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import { useApiMutation } from './useApiMutation'

const { toastAdd, toastRemove } = vi.hoisted(() => ({
  toastAdd: vi.fn(),
  toastRemove: vi.fn(),
}))
mockNuxtImport('useToast', () => () => ({
  add: toastAdd,
  remove: toastRemove,
}))

const authGateState = vi.hoisted(() => ({ isLoggedOut: false }))
mockNuxtImport('useAuthGate', () => () => ({
  isLoggedOut: ref(authGateState.isLoggedOut),
  markLoggedOut: () => {
    authGateState.isLoggedOut = true
  },
}))

beforeEach(() => {
  toastAdd.mockClear()
  toastRemove.mockClear()
  authGateState.isLoggedOut = false
})

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
    // Success is low-stakes: announce politely so it never interrupts.
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Saved',
        color: 'success',
        type: 'background',
      }),
    )
  })

  it('shows a persistent, assertive error toast and skips onSuccess when the mutation rejects', async () => {
    const onSuccess = vi.fn()
    const { pending, execute } = useApiMutation(
      () => Promise.reject(new Error('boom')),
      { errorTitle: 'Could not save', onSuccess },
    )

    await execute()

    expect(onSuccess).not.toHaveBeenCalled()
    // A failed save must stay until acknowledged: no auto-dismiss, an explicit
    // close, and an assertive live region so it interrupts the user.
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Could not save',
        color: 'error',
        type: 'foreground',
        duration: Infinity,
        close: true,
      }),
    )
    expect(pending.value).toBe(false)
  })

  it('offers a Retry action that re-runs the failed mutation with the same args', async () => {
    const mutate = vi
      .fn<(payload: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined)
    const onSuccess = vi.fn()
    const { execute } = useApiMutation(mutate, {
      errorTitle: 'Could not save',
      onSuccess,
    })

    await execute('payload')
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(onSuccess).not.toHaveBeenCalled()

    const errorToast = toastAdd.mock.calls.at(-1)![0]
    const retry = errorToast.actions[0]
    expect(retry.label).toBe('Retry')

    await retry.onClick()

    expect(mutate).toHaveBeenCalledTimes(2)
    expect(mutate).toHaveBeenLastCalledWith('payload')
    expect(onSuccess).toHaveBeenCalledOnce()
  })

  it('routes a 400 validation error to onValidationError instead of the transient toast', async () => {
    // A 400 means the input is wrong, not the connection — surface it on the
    // form, not as a "check your connection" retry toast.
    const onValidationError = vi.fn()
    const rejection = Object.assign(new Error('Bad Request'), {
      status: 400,
      data: { message: 'a weight-loss Goal needs a target below your trend' },
    })
    const { execute } = useApiMutation(() => Promise.reject(rejection), {
      errorTitle: 'Could not set goal',
      onValidationError,
    })

    await execute()

    expect(onValidationError).toHaveBeenCalledWith(
      'a weight-loss Goal needs a target below your trend',
    )
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('reuses one stable toast id so repeated failures replace rather than stack', async () => {
    const { execute } = useApiMutation(() => Promise.reject(new Error('x')), {
      errorTitle: 'Could not save',
    })

    await execute()
    await execute()

    const ids = toastAdd.mock.calls.map((call) => call[0].id)
    expect(ids[0]).toBeTruthy()
    expect(ids[0]).toBe(ids[1])
  })

  it('dismisses the persistent error toast once a later attempt succeeds', async () => {
    const mutate = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined)
    const { execute } = useApiMutation(mutate, { errorTitle: 'Could not save' })

    await execute()
    const errorId = toastAdd.mock.calls.at(-1)![0].id
    expect(toastRemove).not.toHaveBeenCalled()

    await execute()

    expect(toastRemove).toHaveBeenCalledWith(errorId)
  })

  it('skips the generic retry toast once the session has ended', async () => {
    authGateState.isLoggedOut = true
    const { execute } = useApiMutation(() => Promise.reject(new Error('x')), {
      errorTitle: 'Could not save',
    })

    await execute()

    // The logged-out interstitial already replaces the whole app — a
    // "check your connection, Retry" toast on top would be the wrong
    // advice, and Retry would just repeat the same expired-session failure.
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('skips onSuccess and the success toast once the session has ended', async () => {
    authGateState.isLoggedOut = true
    const onSuccess = vi.fn()
    // A mutation that resolves without throwing — e.g. an intercepted
    // opaque-redirect response the underlying fetch client didn't treat as
    // an error — must not be celebrated as a real save.
    const { execute } = useApiMutation(() => Promise.resolve(), {
      successTitle: 'Saved',
      errorTitle: 'Could not save',
      onSuccess,
    })

    await execute()

    expect(onSuccess).not.toHaveBeenCalled()
    expect(toastAdd).not.toHaveBeenCalled()
  })
})
