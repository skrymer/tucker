import { CSRF_HEADER, SAFE_METHODS, readCsrfToken } from '~/utils/csrf'

// Every mutation echoes the XSRF-TOKEN cookie back in a header (ADR 0025). Safe methods
// need none, and there is nothing to send before Tucker has handed one out.
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hooks.hook('openFetch:onRequest:api', ({ options }) => {
    const method = (options.method ?? 'GET').toUpperCase()
    if (SAFE_METHODS.includes(method)) return

    const token = readCsrfToken(document.cookie)
    if (!token) {
      // One missing token recovers on Retry; every mutation failing does not, and would
      // otherwise present as "check your connection" with nothing said anywhere.
      console.warn(`[tucker] no CSRF token to send — ${method} will be refused`)
      return
    }

    options.headers = new Headers(options.headers)
    options.headers.set(CSRF_HEADER, token)
  })
})
