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
    // The named radii in main.css, so tailwind-merge knows `rounded-card`
    // replaces a component's stock `rounded-*` rather than sitting beside it.
    tv: {
      twMergeConfig: {
        extend: { theme: { radius: ['card', 'inset'] } },
      },
    },
    // Pill buttons (DESIGN.md → Shape). Merges over the default `rounded-md`.
    button: {
      slots: {
        base: 'rounded-full',
      },
    },
    // 20px cards with the soft green-tinted lift instead of `rounded-lg`, padded
    // here for every card (DESIGN.md → Shape & elevation): no card sets its own.
    // The padding replaces the stock classes rather than merging over them, so no
    // stock breakpoint survives beside it.
    card: {
      slots: {
        root: 'rounded-card shadow-card',
        header: () => 'p-4 lg:px-5',
        body: () => 'p-4 lg:p-5',
        footer: () => 'p-4 lg:px-5',
      },
    },
  },
})
