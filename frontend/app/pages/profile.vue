<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type ProfileDto = components['schemas']['ProfileDto']

const profile = ref<ProfileDto | null>(null)
const saving = ref(false)
const { $api } = useNuxtApp()
const toast = useToast()

async function loadProfile() {
  try {
    profile.value = await $api('/api/profile')
  } catch {
    // 404 → no profile yet. Leave form empty.
    profile.value = null
  }
}

await loadProfile()

async function handleSubmit(payload: {
  sex: string
  birthDate: string
  heightCm: number
}) {
  if (saving.value) return
  saving.value = true
  try {
    await $api('/api/profile', { method: 'PUT', body: payload as ProfileDto })
    await loadProfile()
    toast.add({ title: 'Profile saved', color: 'success' })
  } catch {
    toast.add({
      title: 'Could not save profile',
      description: 'Check your connection and try again.',
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <h1 class="text-2xl font-bold text-default">Profile</h1>
    <ProfileForm :initial="profile ?? undefined" @submit="handleSubmit" />
  </section>
</template>
