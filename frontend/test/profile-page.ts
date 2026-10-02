import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import ProfilePage from '~/pages/profile/index.vue'

/**
 * Unmount [mounted] and open /profile afresh, which reads everything back:
 * what a save kept is what the page then shows. Resolves once the reads the
 * page makes after mounting (who is signed in, which build answers) have
 * landed, so none outlives the test.
 */
export async function reopenProfile(mounted: { unmount: () => void }) {
  mounted.unmount()
  const page = await renderSuspended(ProfilePage)
  await screen.findByText(/signed in as/i)
  await screen.findByText(/· be /)
  return page
}
