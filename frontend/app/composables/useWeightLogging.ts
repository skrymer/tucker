interface WeightLoggingOptions {
  /** The user's local day, sent as the server-side validation anchor (#24). */
  today: string
  /** Side effect after a successful save (e.g. refresh the dashboard/list). */
  onSaved: () => void | Promise<void>
  /** Success toast title. Omit for a silent save (e.g. the dashboard tile). */
  successTitle?: string
}

/**
 * Logs a Weight Measurement: POSTs the reading with the client's local day as
 * the validation anchor (#24), then runs [options.onSaved]. Re-entry guard,
 * pending flag and failure toast come from [useApiMutation]; the success toast
 * and refresh differ per call site, so they're passed in.
 *
 * It also owns [sheetOpen], because the sheet is the confirmation: it closes
 * when the save lands, never optimistically on submit, which would claim a
 * reading is stored before the server has said so.
 */
export function useWeightLogging(options: WeightLoggingOptions) {
  const { $api } = useNuxtApp()

  const sheetOpen = ref(false)

  const { pending, execute } = useApiMutation(
    (payload: { date: string; weightKg: number }) =>
      $api('/api/weight', {
        method: 'POST',
        body: { ...payload, clientToday: options.today },
      }),
    {
      successTitle: options.successTitle,
      errorTitle: 'Could not save weight',
      onSuccess: async () => {
        sheetOpen.value = false
        await options.onSaved()
      },
    },
  )

  return { sheetOpen, saving: pending, logWeight: execute }
}
