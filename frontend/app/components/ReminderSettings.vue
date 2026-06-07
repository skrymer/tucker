<script setup lang="ts">
import { z } from 'zod'
import type { components } from '#open-fetch-schemas/api'

type ProfileDto = components['schemas']['ProfileDto']

// The hour to nudge at is the single source of truth for the picker (ADR 0003).
const hourSchema = z.object({
  reminderHour: z
    .number({ error: 'Enter an hour between 0 and 23' })
    .int('Hour must be between 0 and 23')
    .min(0, 'Hour must be between 0 and 23')
    .max(23, 'Hour must be between 0 and 23'),
})

const props = defineProps<{ profile: ProfileDto }>()
const emit = defineEmits<{ saved: [] }>()

const {
  isSupported,
  isSubscribed,
  requiresInstall,
  timezone,
  enable,
  disable,
} = useWebPush()

// Persisting reminder prefs is a Profile write: merge the changed fields onto
// the full profile so a save never clobbers the user's body stats or hour.
function useReminderPrefs() {
  const { $api } = useNuxtApp()
  const enabled = ref(props.profile.remindersEnabled)
  const hourForm = reactive({ reminderHour: props.profile.reminderHour })

  // One Profile write that merges the changed prefs onto the full profile, so a
  // save never clobbers the user's body stats or the fields it didn't touch.
  const persist = (prefs: Partial<ProfileDto>) =>
    $api('/api/profile', {
      method: 'PUT',
      body: { ...props.profile, ...prefs },
    })

  // The toggle is the only place notification permission is requested — from
  // this gesture, never on load. Subscribing the device and saving the opt-in is
  // one mutation, so any failure (subscribe, POST, the profile write) surfaces
  // the persistent retry toast (ADR 0005); `enabled` flips only once the whole
  // flow succeeds, so a failed enable can't strand the switch in the on state.
  const { execute: toggle } = useApiMutation(
    async (next: boolean) => {
      if (next) {
        await enable(navigator.userAgent)
        // A denied permission is the user's choice, not a failure — leave it off.
        if (!isSubscribed.value) return
        await persist({
          timezone: timezone.value,
          reminderHour: hourForm.reminderHour,
          remindersEnabled: true,
        })
        enabled.value = true
      } else {
        await disable()
        await persist({ remindersEnabled: false })
        enabled.value = false
      }
    },
    {
      errorTitle: 'Could not update reminders',
      onSuccess: () => emit('saved'),
    },
  )

  // The hour picker validates through its Zod schema before saving (ADR 0003);
  // an out-of-range hour never reaches the Profile.
  const { execute: saveHour } = useApiMutation(
    () => persist({ reminderHour: hourForm.reminderHour }),
    {
      errorTitle: 'Could not save reminder time',
      onSuccess: () => emit('saved'),
    },
  )

  return { enabled, hourForm, toggle, saveHour }
}

const { enabled, hourForm, toggle, saveHour } = useReminderPrefs()
</script>

<template>
  <section class="flex flex-col gap-4">
    <h2 class="text-lg font-semibold text-default">Weekly-review reminder</h2>

    <!-- Firefox-on-some-platforms / older browsers can't subscribe at all. -->
    <p v-if="!isSupported" class="text-sm text-muted">
      Reminders aren't supported on this browser. Open Tucker in a recent
      Chrome, Edge, Firefox, or Safari to turn them on.
    </p>

    <!-- iOS only allows push once installed (ADR 0011): point the way first. -->
    <UAlert
      v-else-if="requiresInstall"
      icon="i-lucide-share"
      color="neutral"
      variant="subtle"
      title="Add Tucker to your home screen first"
      description="On iPhone, reminders work once Tucker is installed. Tap Share, then Add to Home Screen, and open Tucker from there."
    />

    <template v-else>
      <USwitch
        :model-value="enabled"
        label="Weekly-review reminders"
        :description="
          enabled
            ? 'You\'ll get a nudge when a review is due.'
            : 'Get a nudge when a weekly review is due.'
        "
        @update:model-value="toggle"
      />

      <UForm
        :state="hourForm"
        :schema="hourSchema"
        class="flex flex-col gap-3"
        @submit="saveHour"
      >
        <UFormField
          label="Reminder hour"
          name="reminderHour"
          description="The local hour (0–23) to send the reminder at."
        >
          <UInput
            v-model.number="hourForm.reminderHour"
            type="number"
            min="0"
            max="23"
            class="w-24"
          />
        </UFormField>
        <UButton
          type="submit"
          color="neutral"
          variant="subtle"
          class="self-start"
        >
          Save reminder time
        </UButton>
      </UForm>
    </template>
  </section>
</template>
