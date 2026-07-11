// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  // Tucker ships as a client-rendered PWA (see CLAUDE.md "Architecture").
  ssr: false,

  devtools: { enabled: true },

  modules: ['@nuxt/eslint', '@nuxt/ui', '@vite-pwa/nuxt', 'nuxt-open-fetch'],

  css: ['~/assets/css/main.css'],

  // Self-host the "Vital" display face (frontend/DESIGN.md). @nuxt/fonts is
  // registered by @nuxt/ui; it downloads Nunito at build and serves it from the
  // app origin (no runtime CDN), so the installed PWA renders it offline — the
  // woff2 files fall under the Workbox precache glob below.
  fonts: {
    // Pin subsets + styles: without them @nuxt/fonts resolves every Google
    // subset × italic (~20 woff2 files, all swept into the offline precache) for
    // the two faces this English-only app actually renders.
    families: [
      {
        name: 'Nunito',
        provider: 'google',
        weights: [700, 800],
        styles: ['normal'],
        subsets: ['latin'],
      },
    ],
  },

  // Build stamp (issue #117): baked into the client bundle at `nuxt build` time
  // (the Dockerfile sets these env vars from build args; ssr:false bakes the
  // values into the prerendered shell). The Profile footer reads them and shows
  // the backend SHA from /api/version beside this when a partial deploy splits
  // them. Defaults degrade gracefully for local dev.
  runtimeConfig: {
    public: {
      appVersion: process.env.APP_VERSION || 'dev',
      gitSha: process.env.GIT_SHA || 'unknown',
    },
  },

  // Typed API client generated from the backend's OpenAPI spec. The
  // `redirect: 'manual'` fetch option the auth-gate plugin needs
  // (app/plugins/auth-gate.client.ts) isn't part of this client config's
  // type (only baseURL/query/headers are), so it's set per-request via an
  // openFetch:onRequest hook instead.
  openFetch: {
    clients: {
      api: {
        schema: './openapi/tucker.json',
      },
    },
  },

  // /api is proxied to the backend by a runtime nitro server route
  // (server/routes/api/[...].ts) reading TUCKER_API_UPSTREAM. Not a build-time
  // routeRules proxy: the upstream must be read at runtime (not baked) so one
  // promotable image serves dev and prod (ADR 0015).

  // Emit a static index.html for the SPA shell at build time. Without it an
  // ssr:false build renders the shell only at runtime, so there is no document
  // for the service worker to precache and the offline navigateFallback (below)
  // would have nothing to serve.
  nitro: {
    prerender: { routes: ['/'] },
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
        // iOS has no maskable/manifest icon support — it reads the
        // apple-touch-icon link and these meta tags for the home-screen app.
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Tucker' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      ],
      link: [
        {
          rel: 'apple-touch-icon',
          href: '/icons/apple-touch-icon-180x180.png',
        },
      ],
    },
  },

  pwa: {
    registerType: 'autoUpdate',
    // Browsers fetch the manifest without cookies unless the link tag opts in;
    // behind Cloudflare Access a cookie-less fetch is challenged and the
    // install criteria fail, so send the Access session cookie (ADR 0015).
    useCredentials: true,
    // Ship the icon set (and favicon) into the precache so the installed app and
    // its splash have them offline.
    includeAssets: ['favicon.ico', 'icons/*.png'],
    manifest: {
      id: '/',
      name: 'Tucker',
      short_name: 'Tucker',
      description: 'A personal diet tracker.',
      theme_color: '#00c16a',
      // Matches the `.app-canvas` wash in main.css (keep the two in sync).
      background_color: '#eff6f1',
      display: 'standalone',
      start_url: '/',
      scope: '/',
      icons: [
        {
          src: '/icons/pwa-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/icons/pwa-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/icons/maskable-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'maskable',
        },
        {
          src: '/icons/maskable-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    // Precache the built app shell (offline level L1, ADR 0011). As an SPA every
    // navigation falls back to the precached index so the app loads offline
    // instead of white-screening; /api/* is never cached (it's the live backend).
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      // The prerendered shell (index.html → '/') is precached by the glob above,
      // so any offline navigation falls back to it instead of white-screening.
      navigateFallback: '/',
      navigateFallbackDenylist: [/^\/api\//],
      // Layer the Weekly-Review Reminder push/notificationclick handlers onto the
      // generated worker (the file is served from public/ at /push-sw.js).
      importScripts: ['/push-sw.js'],
    },
    // Keep the service worker out of the dev server (it fights HMR); it is
    // generated for the production build, which the smokes and the installed
    // app run against.
    devOptions: { enabled: false },
  },
})
