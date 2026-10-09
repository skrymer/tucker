import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import Design from './design.vue'

describe('/design', () => {
  it('captions every type specimen with its role and the class that sets it', async () => {
    await renderSuspended(Design)

    for (const [role, token] of [
      ['Ring figure', 'text-ring-figure'],
      ['h1', 'text-h1'],
      ['Stat', 'text-stat'],
      ['h2', 'text-h2'],
      ['Body', 'text-body'],
      ['Label', 'text-label'],
      ['Eyebrow', 'text-eyebrow'],
    ]) {
      expect(
        screen.getByText(
          (_, el) =>
            el?.tagName === 'DD' &&
            el
              .textContent!.replace(/\s+/g, ' ')
              .startsWith(`${role} · ${token}`),
        ),
      ).toBeInTheDocument()
    }
  })
})
