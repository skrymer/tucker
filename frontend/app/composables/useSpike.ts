// SPIKE (F12 throwaway) — the prototype variant switcher's shared state.
// Deleted with the branch; nothing here is meant to ship.
export type SpikeSignature = 'none' | 'ring' | 'trend'

const TRACKS_KEY = 'spike-tracks-calories'
const SIGNATURE_KEY = 'spike-signature'

export function useSpike() {
  const tracksCalories = useState(TRACKS_KEY, () =>
    import.meta.client ? localStorage.getItem(TRACKS_KEY) === 'true' : false,
  )
  const signature = useState<SpikeSignature>(SIGNATURE_KEY, () =>
    import.meta.client
      ? ((localStorage.getItem(SIGNATURE_KEY) as SpikeSignature) ?? 'trend')
      : 'trend',
  )

  if (import.meta.client) {
    watch(tracksCalories, (v) => localStorage.setItem(TRACKS_KEY, String(v)))
    watch(signature, (v) => localStorage.setItem(SIGNATURE_KEY, v))
  }

  return { tracksCalories, signature }
}
