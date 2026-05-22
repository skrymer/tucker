// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  // Tucker ships as a client-rendered PWA (see CLAUDE.md "Architecture").
  ssr: false,

  devtools: { enabled: true },

  modules: ['@nuxt/eslint', '@nuxt/ui', '@vite-pwa/nuxt', 'nuxt-open-fetch'],

  css: ['~/assets/css/main.css'],

  // Typed API client generated from the backend's OpenAPI spec.
  openFetch: {
    clients: {
      api: {
        schema: './openapi/tucker.json',
      },
    },
  },

  // Dev: proxy /api to the Spring Boot backend so the SPA stays same-origin.
  routeRules: {
    '/api/**': { proxy: 'http://localhost:8080/api/**' },
  },

  app: {
    head: {
      title: 'Tucker',
      meta: [
        {
          name: 'viewport',
          // viewport-fit=cover lets the bottom nav respect iOS safe areas.
          content: 'width=device-width, initial-scale=1, viewport-fit=cover',
        },
        { name: 'description', content: 'A personal diet tracker.' },
      ],
    },
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Tucker',
      short_name: 'Tucker',
      description: 'A personal diet tracker.',
      theme_color: '#00c16a',
      background_color: '#ffffff',
      display: 'standalone',
      start_url: '/',
    },
    // F1 only wires the module in. Offline shell, install prompt and the
    // web-push reminder are polished in F6 — keep the SW out of dev until then.
    devOptions: { enabled: false },
  },
})
