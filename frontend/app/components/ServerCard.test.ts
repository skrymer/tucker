import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { HttpResponse } from 'msw'
import { http, noConnection, serverError } from '~~/test/mocks/http'
import { server } from '~~/test/mocks/node'
import { health, runningServer, serving } from '~~/test/mocks/handlers/server'
import { renderInApp } from '~~/test/render-in-app'
import ServerCard from './ServerCard.vue'

/** An element's text as assistive technology reads it: without what it hides. */
function spokenText(element: HTMLElement) {
  const copy = element.cloneNode(true) as HTMLElement
  copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove())
  return copy.textContent?.replace(/\s+/g, ' ').trim()
}

/** Renders the card once its reads have answered: the meters draw only then. */
async function renderAnswered() {
  await renderInApp(ServerCard)
  await screen.findByRole('group', { name: 'Heap' })
}

describe('ServerCard', () => {
  it('says its figures run since the last restart, how long ago, and that the filters miss them', async () => {
    await renderAnswered()

    const card = screen.getByRole('region', { name: 'Server' })
    expect(card).toHaveTextContent(
      "Since the last restart, 3 d 7 h ago. The range and engine filters above don't apply.",
    )
  })

  it.each([
    [59, '59 s'],
    [94, '1 min 34 s'],
    [7 * 3600 + 42 * 60 + 5, '7 h 42 min'],
    [86400, '1 d 0 h'],
  ])('says a restart %i seconds ago as %s', async (uptimeSeconds, said) => {
    server.use(serving({ ...runningServer, uptimeSeconds }))
    await renderAnswered()

    expect(screen.getByRole('region', { name: 'Server' })).toHaveTextContent(
      `Since the last restart, ${said} ago.`,
    )
  })

  it('says the server is up when its health is', async () => {
    await renderAnswered()

    expect(screen.getByText('Up')).toBeVisible()
    expect(screen.queryByText('Down')).not.toBeInTheDocument()
  })

  it('reads CPU, heap and disk as they are now, and the GC pauses since the restart', async () => {
    await renderAnswered()

    const reads = (name: string, ...lines: string[]) => {
      const meter = within(screen.getByRole('group', { name }))
      for (const line of lines) expect(meter.getByText(line)).toBeVisible()
    }
    reads('Process CPU', '· now', '3.4%', "Tucker's own share")
    reads('System CPU', '· now', '21%', 'the host, as seen')
    reads('Heap', '· now', '182 MB', 'used of 256 MB')
    reads('Disk used', '· now', '7.7 GB', 'of 39.1 GB, 31.4 GB free')
    reads('GC pauses', '4.8 s', 'over 1,317 pauses since the restart')
    expect(
      within(screen.getByRole('group', { name: 'GC pauses' })).queryByText(
        '· now',
      ),
    ).not.toBeInTheDocument()
  })

  it('times each endpoint p50 to p95, slowest first, with its requests and 5xx, and those too few to time last', async () => {
    await renderAnswered()

    const table = screen.getByRole('table', {
      name: 'Request time by endpoint, p50 to p95',
    })
    expect(within(table).getAllByRole('columnheader').map(spokenText)).toEqual([
      'Endpoint',
      'p50 to p95',
      'Requests',
      '5xx',
    ])
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell').map(spokenText))
    expect(rows).toEqual([
      ['GET /api/admin/metrics', 'p50 88 ms, p95 412 ms', '41', '0'],
      ['GET /api/foods/barcode/{barcode}', 'p50 214 ms, p95 380 ms', '23', '2'],
      ['GET /api/summary', 'p50 19 ms, p95 74 ms', '812', '0'],
      ['GET /api/me', 'p50 4 ms, p95 11 ms', '977', '0'],
      ['DELETE /api/entries/{id}', 'too few', '3', '0'],
      ['POST /api/weekly-review', 'too few', '1', '1'],
    ])
  })

  it('keys the dumbbell: the hollow end p50, the filled end p95', async () => {
    await renderAnswered()

    const legend = screen.getByRole('list', { name: 'Percentiles' })
    expect(within(legend).getAllByRole('listitem').map(spokenText)).toEqual([
      'p50',
      'p95',
    ])
  })

  it("states a row's exact figures when its p50 to p95 is pointed at", async () => {
    await renderAnswered()
    const user = userEvent.setup()

    const row = screen.getByRole('row', { name: /\/api\/summary/ })
    // The dumbbell's focusable wrapper, which the tooltip describes.
    const dumbbell = within(row)
      .getByText('p50 19 ms, p95 74 ms')
      .closest('[tabindex="0"]') as HTMLElement
    await user.hover(dumbbell)

    await vi.waitFor(() =>
      expect(dumbbell).toHaveAccessibleDescription(
        'p50 19 ms → p95 74 ms · 812 requests · 0 answered 5xx',
      ),
    )
  })

  it('says nothing has been requested yet just after a restart, the meters still read', async () => {
    server.use(serving({ ...runningServer, uptimeSeconds: 94, requests: [] }))
    await renderInApp(ServerCard)

    expect(
      await screen.findByText('No requests since the restart'),
    ).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Heap' })).toBeVisible()
  })

  // Actuator answers DOWN with a 503; it is a result, not a failed read.
  it('says the server is down when its health answers DOWN, its figures still shown', async () => {
    server.use(health({ status: 'DOWN' }))
    await renderInApp(ServerCard)

    expect(await screen.findByText('Down')).toBeVisible()
    expect(screen.queryByText('Up')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Server' })).toHaveTextContent(
      '3 d 7 h ago',
    )
  })

  it("says the server figures couldn't be read when the scrape fails", async () => {
    server.use(
      http.get('/api/actuator/prometheus', ({ response }) =>
        response.untyped(serverError()),
      ),
    )
    await renderInApp(ServerCard)

    const card = screen.getByRole('region', { name: 'Server' })
    expect(
      await within(card).findByRole('heading', {
        name: "Couldn't read the server figures",
      }),
    ).toBeVisible()
    expect(within(card).getByRole('button', { name: 'Retry' })).toBeVisible()
    expect(within(card).queryByText('Up')).not.toBeInTheDocument()
  })

  // The proxy answers 503 too when the backend is unreachable, with no health in it.
  it("says the server figures couldn't be read when the health read fails, even as a 503", async () => {
    server.use(
      http.get('/api/actuator/health', ({ response }) =>
        response.untyped(HttpResponse.json(noConnection, { status: 503 })),
      ),
    )
    await renderInApp(ServerCard)

    const card = screen.getByRole('region', { name: 'Server' })
    expect(
      await within(card).findByRole('heading', {
        name: "Couldn't read the server figures",
      }),
    ).toBeVisible()
    expect(within(card).queryByText('Down')).not.toBeInTheDocument()
  })

  it('reads the server figures again on Retry', async () => {
    let failing = true
    server.use(
      http.get('/api/actuator/prometheus', ({ response }) =>
        failing ? response.untyped(serverError()) : undefined,
      ),
    )
    await renderInApp(ServerCard)
    const user = userEvent.setup()
    const retry = await screen.findByRole('button', { name: 'Retry' })

    failing = false
    await user.click(retry)

    expect(await screen.findByText('Up')).toBeVisible()
    expect(
      screen.queryByRole('heading', {
        name: "Couldn't read the server figures",
      }),
    ).not.toBeInTheDocument()
  })
})
