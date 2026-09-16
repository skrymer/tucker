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

const authGateState = vi.hoisted(() => ({ isSignedOut: false }))
mockNuxtImport('useAuthGate', () => () => ({
  isSignedOut: ref(authGateState.isSignedOut),
  markSignedOut: () => {
    authGateState.isSignedOut = true
  },
}))

beforeEach(() => {
  toastAdd.mockClear()
  toastRemove.mockClear()
  authGateState.isSignedOut = false
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
    // Success is low-stakes: announce politely so it never interrupts. A flow
    // that names no `successDescription` stays a bare title — the second line is
    // opt-in, so a stray one here would be a regression.
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Saved',
        description: undefined,
        color: 'success',
        type: 'background',
      }),
    )
  })

  it('describes the success toast from what the mutation returned', async () => {
    // The server is the only honest source for the figures — deriving them
    // client-side is the business logic ADR 0002 keeps out of the UI.
    const { execute } = useApiMutation(
      () => Promise.resolve({ foodName: 'Banana', calories: 107 }),
      {
        successTitle: 'Entry logged',
        errorTitle: 'Could not save entry',
        successDescription: (entry) =>
          `${entry.foodName} — ${entry.calories} kcal`,
      },
    )

    await execute()

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Entry logged',
        description: 'Banana — 107 kcal',
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
        progress: false,
      }),
    )
    expect(pending.value).toBe(false)
  })

  it('surfaces the same retry toast when a mutation fails with an AbortError', async () => {
    // An unreachable push service rejects `pushManager.subscribe()` with a bare
    // AbortError. Nothing cancelled the save, so it is an ordinary failure — and
    // this mutation raises no success toast, so reading it as a cancellation
    // would leave the user with nothing at all (ADR 0005).
    const { execute } = useApiMutation(
      () =>
        Promise.reject(
          new DOMException(
            'Registration failed - push service error',
            'AbortError',
          ),
        ),
      { errorTitle: 'Could not update reminders' },
    )

    await execute()

    // Only the rejection's *type* is new here — the toast's persistence and its
    // Retry are the shared contract the tests above and below already own. What
    // this cannot see is the classification: an `AbortError` read as a
    // cancellation reaches `announceFailure` by the other branch and raises the
    // same toast, so `useAsyncAction`'s own suite is what pins that.
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Could not update reminders',
        description: CONNECTION_ERROR_MESSAGE,
      }),
    )
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

    // Most refusals name no field — the form falls back to wherever it shows one.
    expect(onValidationError).toHaveBeenCalledWith(
      'a weight-loss Goal needs a target below your trend',
      null,
    )
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('hands on the field a 400 names, so a form can show it in place', async () => {
    // Two inputs on one form can each be refused, and the message alone cannot
    // say which — an unrouted one lands under whichever field the client picked.
    const onValidationError = vi.fn()
    const rejection = Object.assign(new Error('Bad Request'), {
      status: 400,
      data: {
        message: '1.5 kg a week would leave you nothing to eat',
        field: 'rateKgPerWeek',
      },
    })
    const { execute } = useApiMutation(() => Promise.reject(rejection), {
      errorTitle: 'Could not set goal',
      onValidationError,
    })

    await execute()

    expect(onValidationError).toHaveBeenCalledWith(
      '1.5 kg a week would leave you nothing to eat',
      'rateKgPerWeek',
    )
  })

  it('shows the retry toast for a 400 that carries no message to route', async () => {
    // A 400 is only routable to a form if it says something a field can show.
    // Without a body there is nothing to put under an input, and the failure
    // still owes the persistent toast (ADR 0005) rather than silence.
    const onValidationError = vi.fn()
    const rejection = Object.assign(new Error('Bad Request'), { status: 400 })
    const { execute } = useApiMutation(() => Promise.reject(rejection), {
      errorTitle: 'Could not set goal',
      onValidationError,
    })

    await execute()

    expect(onValidationError).not.toHaveBeenCalled()
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not set goal' }),
    )
  })

  it('shows the retry toast when the rejection is not an object at all', async () => {
    // The factory wraps any mutation function, so it cannot assume the shape of
    // what one rejects with. A bare rejection must reach the toast, not throw
    // inside the handler and lose the failure entirely.
    const onValidationError = vi.fn()
    const { execute } = useApiMutation(() => Promise.reject(null), {
      errorTitle: 'Could not set goal',
      onValidationError,
    })

    await execute()

    expect(onValidationError).not.toHaveBeenCalled()
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not set goal' }),
    )
  })

  it('shows the retry toast for a non-validation failure even when the form can route one', async () => {
    // Only a 400 means the input is wrong. Every other status is transient and
    // owes the persistent toast (ADR 0005) — routing one to a field would leave
    // a failed save saying nothing a Retry could recover.
    const onValidationError = vi.fn()
    const rejection = Object.assign(new Error('Conflict'), {
      status: 409,
      data: { message: 'that goal is already active' },
    })
    const { execute } = useApiMutation(() => Promise.reject(rejection), {
      errorTitle: 'Could not set goal',
      onValidationError,
    })

    await execute()

    expect(onValidationError).not.toHaveBeenCalled()
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not set goal' }),
    )
  })

  it('falls back to the retry toast when a form has nowhere to put a validation error', async () => {
    // A backstop, not the designed path: ADR 0005 routes a domain rejection
    // through `onValidationError` and the rest are guarded by Zod before they
    // are sent. A form that opted into neither still owes the user a sentence.
    const rejection = Object.assign(new Error('Bad Request'), {
      status: 400,
      data: { message: 'grams must be positive' },
    })
    const { execute } = useApiMutation(() => Promise.reject(rejection), {
      errorTitle: 'Could not log entry',
    })

    await execute()

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not log entry' }),
    )
  })

  it('clears a stale retry toast when the next attempt is refused as invalid', async () => {
    const onValidationError = vi.fn()
    const mutate = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(
        Object.assign(new Error('Bad Request'), {
          status: 400,
          data: { message: 'a target below your trend' },
        }),
      )
      .mockRejectedValueOnce(new Error('boom'))
    const { execute } = useApiMutation(mutate, {
      errorTitle: 'Could not set goal',
      onValidationError,
    })

    await execute()
    const errorId = toastAdd.mock.calls.at(-1)![0].id

    await execute()

    // The transient failure is over, and leaving its Retry up would offer to
    // replay the call the form has just been told is wrong.
    expect(onValidationError).toHaveBeenCalled()
    expect(toastRemove).toHaveBeenCalledWith(errorId)

    await execute()

    // And the id goes down with it, or the next failure would be merged into the
    // toast just taken down and deleted along with it.
    expect(toastAdd.mock.calls.at(-1)![0].id).not.toBe(errorId)
  })

  it('says nothing at all when a mutation naming no successTitle lands', async () => {
    // ADR 0005's quiet success: the result is already visible at the point of
    // focus, so the great majority of mutations raise no toast on the way out.
    const onSuccess = vi.fn()
    const { execute } = useApiMutation(() => Promise.resolve(), {
      errorTitle: 'Could not save',
      onSuccess,
    })

    await execute()

    expect(onSuccess).toHaveBeenCalledOnce()
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

  it('gives each mutation a toast id of its own, so one failure never replaces another', async () => {
    const reject = () => Promise.reject(new Error('x'))
    const { execute: saveGoal } = useApiMutation(reject, {
      errorTitle: 'Could not set goal',
    })
    const { execute: saveWeight } = useApiMutation(reject, {
      errorTitle: 'Could not save weight',
    })

    await saveGoal()
    const goal = toastAdd.mock.calls.at(-1)![0]
    await saveWeight()

    expect(toastAdd.mock.calls.at(-1)![0].id).not.toBe(goal.id)
  })

  it('raises a failed retry under an id of its own, clear of the toast the tap closed', async () => {
    const { execute } = useApiMutation(() => Promise.reject(new Error('x')), {
      errorTitle: 'Could not save',
    })

    await execute()
    const first = toastAdd.mock.calls.at(-1)![0]

    await first.actions[0].onClick()
    const second = toastAdd.mock.calls.at(-1)![0]

    await second.actions[0].onClick()
    const third = toastAdd.mock.calls.at(-1)![0]

    // Tapping an action closes the toast it sits on, and a closing toast's id
    // is unusable: a failure re-raised under it is merged into the dying toast
    // and deleted with it, leaving the user nothing. So every retry's failure
    // gets an id of its own — and the Retry that makes it worth leaving up.
    expect(second.id).not.toBe(first.id)
    expect(third.id).not.toBe(second.id)
    expect(third.title).toBe('Could not save')
    expect(third.actions[0].label).toBe('Retry')
  })

  it('gives up an id once it has dismissed it, so a later failure is not swept away with it', async () => {
    const mutate = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'))
    const { execute } = useApiMutation(mutate, { errorTitle: 'Could not save' })

    await execute()
    const failed = toastAdd.mock.calls.at(-1)![0]
    await execute()
    await execute()
    const afterDismissal = toastAdd.mock.calls.at(-1)![0]

    // Dismissing a toast leaves its id deleted a fraction of a second later, and
    // a re-`add` under it in the meantime is merged into the dying toast rather
    // than mounting a new one — so the dismissal spends the id too.
    expect(afterDismissal.id).not.toBe(failed.id)
  })

  it('dismisses a toast an earlier instance of the same mutation left up', async () => {
    const { execute: before } = useApiMutation(
      () => Promise.reject(new Error('x')),
      { errorTitle: 'Could not save' },
    )
    await before()
    await toastAdd.mock.calls.at(-1)![0].actions[0].onClick()
    const live = toastAdd.mock.calls.at(-1)![0]

    // The page was left and come back to, so this is a second instance of the
    // same mutation. The toast list is the app's rather than the component's, so
    // the failure is still up — and it is this instance that has to take it down.
    const { execute: after } = useApiMutation(() => Promise.resolve(), {
      errorTitle: 'Could not save',
    })
    await after()

    expect(toastRemove).toHaveBeenCalledWith(live.id)
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
    authGateState.isSignedOut = true
    const { execute } = useApiMutation(() => Promise.reject(new Error('x')), {
      errorTitle: 'Could not save',
    })

    await execute()

    // The signed-out interstitial already replaces the whole app — a
    // "check your connection, Retry" toast on top would be the wrong
    // advice, and Retry would just repeat the same expired-session failure.
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('skips onSuccess and the success toast once the session has ended', async () => {
    authGateState.isSignedOut = true
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
