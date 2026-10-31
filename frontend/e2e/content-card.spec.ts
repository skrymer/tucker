import type { Locator, Page } from '@playwright/test'
import { weighedEntry } from '../test/entry-fixtures'
import { goalInProgress } from '../test/mocks/handlers/goal'
import { summaryOf } from '../test/mocks/handlers/summary'
import { expect, test } from './support/test'

// The content card's band, measured. The component test sees the region, its
// heading and the icon's name; whether the divider is drawn, the glyph paints
// and the band sits at the body's sides, only a browser can say — in either
// theme (DESIGN.md → Content card).

const TODAYS_CARDS = [
  { name: "Today's weight", icon: 'scale' },
  { name: "Today's targets", icon: 'gauge' },
  { name: /^Today · /, icon: 'sun' },
  { name: 'Goal', icon: 'target' },
]

/**
 * Answer the Iconify CDN with a stand-in glyph for every icon asked for. The
 * suite's baseline answers it with a miss, so no icon would paint at all; the
 * glyph's shape is not under test, only that the band paints its icon.
 */
async function drawEveryIcon(page: Page) {
  await page.route('https://api.iconify.design/**', (route) => {
    const url = new URL(route.request().url())
    const prefix = url.pathname.replace(/^\/|\.json$/g, '')
    const names = url.searchParams.get('icons')?.split(',') ?? []
    return route.fulfill({
      json: {
        prefix,
        width: 24,
        height: 24,
        icons: Object.fromEntries(
          // In `currentColor`, as Lucide's are: @nuxt/icon draws such a glyph
          // as a mask the text colour fills, and any other as a background.
          names.map((name) => [
            name,
            { body: '<rect width="24" height="24" fill="currentColor"/>' },
          ]),
        ),
      },
    })
  })
}

/** What a card's band draws: its divider, its icon, and its sides. */
async function bandOf(card: Locator) {
  return card.evaluate((section) => {
    const header = section.querySelector<HTMLElement>('[data-slot="header"]')!
    const body = section.querySelector<HTMLElement>('[data-slot="body"]')!
    const icon = header.querySelector<HTMLElement>('h2 .iconify')!
    // The card's `divide-y` rules the band's bottom edge.
    const band = getComputedStyle(header)
    const glyph = getComputedStyle(icon)
    const { width, height } = icon.getBoundingClientRect()
    // `--ui-primary` is a var() chain; a probe resolves it to a colour.
    const probe = document.createElement('span')
    probe.style.color = 'var(--ui-primary)'
    section.append(probe)
    const primary = getComputedStyle(probe).color
    probe.remove()
    return {
      divider: {
        width: band.borderBottomWidth,
        drawn:
          band.borderBottomStyle === 'solid' &&
          band.borderBottomColor !== getComputedStyle(section).backgroundColor,
      },
      icon: {
        name: [...icon.classList]
          .find((c) => c.startsWith('i-lucide:'))
          ?.slice('i-lucide:'.length),
        size: `${width}x${height}`,
        painted: glyph.maskImage !== 'none',
        primary: glyph.color === primary || `${glyph.color} ≠ ${primary}`,
      },
      sides:
        band.paddingLeft === getComputedStyle(body).paddingLeft &&
        band.paddingRight === getComputedStyle(body).paddingRight,
    }
  })
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`in ${colorScheme} mode`, () => {
    test.use({ colorScheme })

    test("every Today card draws its band: a divider, its subject's icon, the body's sides", async ({
      page,
      goto,
      network,
    }) => {
      await drawEveryIcon(page)
      network.use(
        goalInProgress(),
        summaryOf({
          caloriesConsumed: 240,
          proteinConsumed: 8,
          estimatedCalorieShare: 0,
          setupComplete: true,
          calorieBudget: 2000,
          proteinFloor: 140,
          caloriesRemaining: 1760,
          dayStatus: 'in-progress',
          entries: [
            weighedEntry({
              id: 1,
              calories: 240,
              protein: 8,
              foodName: 'Oats',
            }),
          ],
        }),
      )
      await goto('/', { waitUntil: 'hydration' })

      for (const { name, icon } of TODAYS_CARDS) {
        const card = page.getByRole('region', { name })
        await expect(card).toBeVisible()
        // A CSS icon paints once its icon data has loaded, after hydration.
        await expect
          .poll(() => bandOf(card), { message: String(name) })
          .toEqual({
            divider: { width: '1px', drawn: true },
            icon: { name: icon, size: '20x20', painted: true, primary: true },
            sides: true,
          })
      }
    })
  })
}
