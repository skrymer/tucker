import { INSTALL_OFFER_EVENT, INSTALLED_EVENT } from '~/utils/installEvents'

export type PwaPlatform = 'ios' | 'android' | 'desktop'

/** The browser's `beforeinstallprompt` event — only the parts we drive. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

// Module-scoped, not per-call: the browser makes its install offer once per page
// load, before any route component mounts, and never repeats it — so the offer
// is captured at boot (the pwa-install plugin) and outlives every consumer.
const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
const installedThisSession = ref(false)

function onBeforeInstallPrompt(event: Event) {
  // Stop Chromium's default mini-infobar; we drive the install ourselves.
  event.preventDefault()
  deferredPrompt.value = event as BeforeInstallPromptEvent
}

function onAppInstalled() {
  installedThisSession.value = true
  deferredPrompt.value = null
}

/** Start listening for the browser's install events. Runs once, at app boot. */
export function startPwaInstallCapture() {
  window.addEventListener(INSTALL_OFFER_EVENT, onBeforeInstallPrompt)
  window.addEventListener(INSTALLED_EVENT, onAppInstalled)
}

/**
 * Drop the capture. Test-only: a page never un-offers an install or uninstalls.
 * An export rather than the `useAuthGate` route of writing the state back through
 * the composable, because both signals it holds are read-only computeds. Any test
 * file that dispatches an install event owes this in its `afterEach`.
 */
export function resetPwaInstallCapture() {
  deferredPrompt.value = null
  installedThisSession.value = false
}

function detectInstalled(): boolean {
  // Chromium/Android/desktop report the installed app via display-mode;
  // iOS Safari exposes it as the legacy navigator.standalone flag.
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
  const iosStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return Boolean(standalone || iosStandalone)
}

function detectPlatform(): PwaPlatform {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

async function promptInstall() {
  const event = deferredPrompt.value
  if (!event) return
  // The captured event can only be prompted once, so drop it afterwards.
  deferredPrompt.value = null
  await event.prompt()
}

export function usePwaInstall() {
  // The platform and how Tucker was opened are fixed for the life of the page,
  // so neither is reactive. Only an install performed while it is open moves,
  // and that arrives on the shared capture. Read here rather than hoisted beside
  // that capture: module scope is evaluated on import, which is too early for a
  // caller — or a test — to have set up the browser it should be reading.
  const platform = detectPlatform()
  const openedInstalled = detectInstalled()
  const isInstalled = computed(
    () => installedThisSession.value || openedInstalled,
  )

  const canInstall = computed(() => deferredPrompt.value !== null)
  // iOS Safari never fires beforeinstallprompt, so the only path to the home
  // screen is the manual Share sheet — surfaced as instructions instead
  // (ADR 0011).
  const iosInstructions = computed(
    () => platform === 'ios' && !isInstalled.value,
  )

  return { platform, isInstalled, canInstall, iosInstructions, promptInstall }
}
