<script setup lang="ts">
// The build stamp in the Profile footer: the running semver + git SHA. The
// frontend's are baked into the bundle at build time (runtimeConfig.public); the
// backend's comes from GET /api/version, so a partial deploy (mismatched SHAs)
// is visible. The match/split formatting lives in the pure formatBuildTag util.
function useBuildVersion() {
  const { appVersion, gitSha } = useRuntimeConfig().public
  const { $api } = useNuxtApp()
  const backendSha = ref<string | null>(null)

  onMounted(async () => {
    try {
      backendSha.value = (await $api('/api/version')).gitSha
    } catch {
      // Backend unreachable or predating this endpoint: leave backendSha null so
      // the tag shows the frontend stamp alone rather than nothing.
    }
  })

  return computed(() => formatBuildTag(appVersion, gitSha, backendSha.value))
}

const tag = useBuildVersion()
</script>

<template>
  <p class="text-center text-xs text-muted">{{ tag }}</p>
</template>
