import { expect, test } from './support/test'

// The Iconify CDN's name does not resolve, as in a DNS outage. Launch options
// force a worker of their own, so this lives in a file of its own.
test.use({
  launchOptions: {
    args: ['--host-resolver-rules=MAP api.iconify.design ~NOTFOUND'],
  },
})

// What fails it is the error guard, at teardown: an icon lookup that reaches
// the network is a failed request.
test('renders a page with icons while the Iconify CDN cannot be resolved', async ({
  page,
  goto,
}) => {
  await goto('/', { waitUntil: 'hydration' })

  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('navigation').first()).toBeVisible()
})
