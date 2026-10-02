import { describe, expect, it } from 'vitest'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { baselineProfile } from './handlers/profile'
import { http } from './http'
import { assertNoUnhandledRequests, server, useMswServer } from './node'

useMswServer()

// Not in the spec, so the baseline can never grow to cover it.
const UNCOVERED = '/api/uncovered'

describe('the MSW baseline under the Nuxt test environment', () => {
  it('answers $fetch, with the query string reaching the handler', async () => {
    const summary = await $fetch('/api/summary', {
      query: { date: '2026-06-16' },
    })

    expect(summary).toMatchObject({
      date: '2026-06-16',
      calorieBudget: 2448.6,
    })
  })

  it('answers the generated $api client', async () => {
    const { $api } = useNuxtApp()

    const profile = await $api('/api/profile')

    expect(profile).toMatchObject({ tracksCalories: true })
  })

  it('hands a JSON request body to the handler', async () => {
    server.use(
      http.post('/api/tags', async ({ request, response }) => {
        const { name } = await request.json()
        return response(200).json({ id: 7, name, foodCount: 0 })
      }),
    )
    const { $api } = useNuxtApp()

    const tag = await $api('/api/tags', {
      method: 'POST',
      body: { name: 'Snacks' },
    })

    expect(tag).toEqual({ id: 7, name: 'Snacks', foodCount: 0 })
  })

  it('answers a once override a single time, then the baseline again', async () => {
    server.use(
      http.get(
        '/api/profile',
        ({ response }) =>
          response(200).json({ ...baselineProfile, tracksCalories: false }),
        { once: true },
      ),
    )

    const first = await $fetch('/api/profile')
    const second = await $fetch('/api/profile')

    expect(first).toMatchObject({ tracksCalories: false })
    expect(second).toMatchObject({ tracksCalories: true })
  })

  it('drops every override on resetHandlers, keeping the baseline', async () => {
    server.use(
      http.get('/api/profile', ({ response }) =>
        response(200).json({ ...baselineProfile, tracksCalories: false }),
      ),
    )
    expect(await $fetch('/api/profile')).toMatchObject({
      tracksCalories: false,
    })

    server.resetHandlers()

    expect(await $fetch('/api/profile')).toMatchObject({
      tracksCalories: true,
    })
  })

  it('fails a request no handler covers, rather than answering it with a 404', async () => {
    await expect($fetch(UNCOVERED)).rejects.toThrow(/500 Unhandled Exception/)
    expect(() => assertNoUnhandledRequests()).toThrow(/GET \/api\/uncovered/)
  })

  it('names a request no handler covered when the test ends, even if the page caught it', async () => {
    await $fetch(UNCOVERED).catch(() => undefined)

    expect(() => assertNoUnhandledRequests()).toThrow(/GET \/api\/uncovered/)
  })

  it('names a request an override let fall through to no handler, rather than sending it to the network', async () => {
    // Matched, so msw counts it handled — and with nothing under it to answer,
    // it would go out to the real network instead.
    server.use(http.post('/api/tags', () => undefined))

    await $fetch('/api/tags', { method: 'POST', body: { name: 'x' } }).catch(
      () => undefined,
    )

    expect(() => assertNoUnhandledRequests()).toThrow(/POST \/api\/tags/)
  })

  // Passes only because the test fails: the request is swallowed, so nothing in
  // the body notices it, and what fails the test is the check after it ends.
  it.fails(
    'fails a test whose page swallowed a request no handler covers',
    async () => {
      await $fetch(UNCOVERED).catch(() => undefined)
    },
  )

  it('answers a relative fetch from the handlers, not with a 404', async () => {
    const response = await fetch('/api/profile')

    expect(await response.json()).toMatchObject({ tracksCalories: true })
  })

  it('rejects a request its caller aborts while the handler is still answering', async () => {
    let release!: () => void
    const answered = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get('/api/profile', async ({ response }) => {
        await answered
        return response(200).json(baselineProfile)
      }),
    )
    const controller = new AbortController()

    const read = $fetch('/api/profile', { signal: controller.signal })
    controller.abort()
    release()

    await expect(read).rejects.toThrow(/abort/i)
  })

  it('leaves a path registered through registerEndpoint to Nuxt', async () => {
    registerEndpoint('/api/me', () => ({ email: 'nuxt@example.com' }))

    expect(await $fetch('/api/me')).toEqual({ email: 'nuxt@example.com' })
  })
})
