export function isAuthRedirectResponse(response: { type?: string }): boolean {
  return response.type === 'opaqueredirect'
}

// Module-scoped, not per-call: every page and the app shell must observe the
// same "the session ended" signal, set once from wherever the intercepting
// redirect is first seen (the auth-gate plugin).
const isSignedOut = ref(false)

export function useAuthGate() {
  function markSignedOut() {
    isSignedOut.value = true
  }

  return { isSignedOut, markSignedOut }
}
