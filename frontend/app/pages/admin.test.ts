import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import { server } from '~~/test/mocks/node'
import { signedInAsAdmin } from '~~/test/mocks/handlers/identity'
import AdminPage from './admin.vue'

// The phone notice and the wide column are layout, which happy-dom cannot
// compute; e2e/admin.spec.ts measures them, and the not-found page a non-Admin
// meets.

describe('/admin', () => {
  it('is the Metrics page under an Admin eyebrow', async () => {
    server.use(signedInAsAdmin)
    await renderSuspended(AdminPage)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Metrics',
    )
    expect(screen.getByText('Admin')).toBeVisible()
  })

  it('says nothing has been measured yet', async () => {
    server.use(signedInAsAdmin)
    await renderSuspended(AdminPage)

    expect(
      screen.getByRole('heading', { level: 2, name: 'Nothing measured yet' }),
    ).toBeVisible()
    expect(
      screen.getByText(
        'Page timings appear here once Tucker starts recording them.',
      ),
    ).toBeVisible()
  })
})
