export type PwaPlatform = 'ios' | 'android' | 'desktop'

/** The browser's `beforeinstallprompt` event — only the parts we drive. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

export function usePwaInstall() {
  const platform = ref<PwaPlatform>('desktop')
  const isInstalled = ref(false)
  const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)

  const canInstall = computed(() => deferredPrompt.value !== null)
  // iOS Safari never fires beforeinstallprompt, so the only path to the home
  // screen is the manual Share sheet — surfaced as instructions instead.
  const iosInstructions = computed(
    () => platform.value === 'ios' && !isInstalled.value,
  )

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

  function onBeforeInstallPrompt(event: Event) {
    // Stop Chromium's default mini-infobar; we drive the install ourselves.
    event.preventDefault()
    deferredPrompt.value = event as BeforeInstallPromptEvent
  }

  function onAppInstalled() {
    isInstalled.value = true
    deferredPrompt.value = null
  }

  async function promptInstall() {
    const event = deferredPrompt.value
    if (!event) return
    // The captured event can only be prompted once, so drop it afterwards.
    deferredPrompt.value = null
    await event.prompt()
  }

  onMounted(() => {
    platform.value = detectPlatform()
    isInstalled.value = detectInstalled()
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    onBeforeUnmount(() => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    })
  })

  return { platform, isInstalled, canInstall, iosInstructions, promptInstall }
}
