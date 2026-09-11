import { startPwaInstallCapture } from '~/composables/usePwaInstall'

// The install offer has to be captured from app boot — see usePwaInstall.
//
// Not `$pwa`: @vite-pwa/nuxt ships this same capture, but only behind its
// `pwa.installPrompt` key, which also turns on a localStorage "don't show me
// again" flow Tucker does not offer — and reading the offer off that module's
// reactive object would put a third-party collaborator where usePwaInstall's
// tests drive the browser event itself (ADR 0013 rule 1).
export default defineNuxtPlugin(() => {
  startPwaInstallCapture()
})
