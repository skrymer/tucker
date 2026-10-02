import { expect, test } from './support/network'
import { http } from '../test/mocks/http'

// Passes only because the test fails: the page swallows the failed request, so
// nothing in the body notices it, and what fails the test is the fixture's check
// once it ends.
test.fail(
  'fails a test whose override let an /api request fall through to no handler',
  async ({ page, goto, network, isMobile }) => {
    test.skip(isMobile, 'the fixture is the same at every viewport')
    // Matched, so msw counts it handled — and with nothing under it to answer,
    // it would go on to the server's /api proxy instead.
    network.use(http.post('/api/tags', () => undefined))
    await goto('/', { waitUntil: 'hydration' })

    await page.evaluate(() =>
      fetch('/api/tags', { method: 'POST', body: '{"name":"x"}' }).catch(
        () => undefined,
      ),
    )
    await expect(page.getByRole('main')).toBeVisible()
  },
)
