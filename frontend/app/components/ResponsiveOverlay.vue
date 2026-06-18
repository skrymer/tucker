<script setup lang="ts">
defineProps<{ title: string; dismissible?: boolean }>()
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
    :dismissible="dismissible"
    :ui="isDesktop ? undefined : bottomSheetUi"
  >
    <template #body><slot /></template>
  </UModal>
</template>
