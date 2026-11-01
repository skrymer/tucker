import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import { micronutrientIntake } from '~~/test/micronutrient-fixtures'
import MicronutrientBody from './MicronutrientBody.vue'

describe('MicronutrientBody', () => {
  it('states how much of the window can report a vitamin or mineral at all', async () => {
    await renderSuspended(MicronutrientBody, {
      props: { intake: micronutrientIntake({ coverage: 0.62 }) },
    })

    expect(
      screen.getByText(
        /62% of the last 7 days' calories came from food Tucker can read/,
      ),
    ).toBeVisible()
  })
})
