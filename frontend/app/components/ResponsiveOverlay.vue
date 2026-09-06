<script setup lang="ts">
/**
 * Escape and the backdrop are refused, and the corner close is the sheet's one
 * exit — its *universal* out, since no sheet here carries a Cancel (ADR 0017).
 * It is kept in every state, including while a request is in flight: nothing
 * bounds that window, so taking the exit away would trap a User behind a hung
 * request. Dismissing mid-request abandons what was being composed, which is
 * what a deliberate tap on it asks for.
 */
// Stryker disable next-line all: a compiler macro must stay a top-level statement
defineProps<{ title: string }>()
// Stryker disable next-line all: a compiler macro's arguments are hoisted out of setup()
const open = defineModel<boolean>('open', { required: true })

// A bottom sheet on phone, a centred modal on desktop — both are the SAME Reka
// Dialog (UModal). On phone we deliberately avoid UDrawer (Vaul): on an
// installed iOS PWA, Vaul's fixed-position + body scroll-lock leaves the sheet
// unresponsive after the soft keyboard dismisses — a stray tap outside the
// field then freezes the field, Log, and Cancel. A Reka Dialog keeps the modal
// semantics we want (backdrop dim, focus trap) without that bug; it closes via
// the corner close button or a sheet's own Cancel. See ADR 0017.
const isDesktop = useIsDesktop()

// Phone: pin the dialog to the bottom edge, full-width, rounded top, sliding up
// from the bottom and clearing the iOS home indicator. tailwind-merge lets these
// override the centred-modal defaults. Desktop keeps the default centred modal.
const bottomSheetUi = {
  content:
    'top-auto bottom-0 inset-x-0 w-full max-w-none translate-x-0 translate-y-0 ' +
    'rounded-t-2xl rounded-b-none max-h-[90dvh] pb-[env(safe-area-inset-bottom)] ' +
    'data-[state=open]:animate-[slide-in-from-bottom_200ms_ease-out] ' +
    'data-[state=closed]:animate-[slide-out-to-bottom_150ms_ease-in]',
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :dismissible="false"
    :ui="isDesktop ? undefined : bottomSheetUi"
  >
    <template #body><slot /></template>
  </UModal>
</template>
