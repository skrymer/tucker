// Tucker "Vital" design system — see frontend/DESIGN.md.
// Green = brand/primary, coral = secondary (protein), warm green-biased
// neutrals. Pills + rounded cards carry the friendly, health-forward identity.
// The token values (palettes, surfaces, shadows, display face) live in
// app/assets/css/main.css; this file only assigns the Nuxt UI colour roles and
// the two component shape overrides.
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'green',
      secondary: 'coral',
      neutral: 'neutral',
      success: 'green',
      warning: 'amber',
      error: 'red',
    },
    // Pill buttons (DESIGN.md → Shape). Merges over the default `rounded-md`.
    button: {
      slots: {
        base: 'rounded-full',
      },
    },
    // 20px cards with the soft green-tinted lift instead of `rounded-lg`.
    card: {
      slots: {
        root: 'rounded-[1.25rem] shadow-card',
      },
    },
  },
})
