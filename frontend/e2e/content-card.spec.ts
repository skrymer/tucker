import type { Locator, Page } from '@playwright/test'
import { weighedEntry } from '../test/entry-fixtures'
import { dailyLogs } from '../test/mocks/handlers/entries'
import { goalInProgress } from '../test/mocks/handlers/goal'
import { summaryOf } from '../test/mocks/handlers/summary'
import { isoShiftDays, pinToLocalMorning } from './support/date'
import { expect, test } from './support/test'

// The content card's band, measured. The component test sees the region, its
// heading and the icon's name; whether the divider is drawn, the glyph paints
// and the band sits at the body's sides, only a browser can say — in either
// theme (DESIGN.md → Content card).

const TODAYS_CARDS = [
  { name: "Today's weight", icon: 'scale' },
  { name: "Today's targets", icon: 'gauge' },
  { name: /^Today · /, icon: 'sun' },
  { name: /^Tomorrow · /, icon: 'sunrise' },
  { name: 'Goal', icon: 'target' },
]

const OATS = weighedEntry({
  id: 1,
  calories: 240,
  protein: 8,
  foodName: 'Oats',
})

/** Today with an Entry logged, and its Budget and Floor set. */
const loggedDay = {
  caloriesConsumed: 240,
  proteinConsumed: 8,
  estimatedCalorieShare: 0,
  setupComplete: true,
  calorieBudget: 2000,
  proteinFloor: 140,
  caloriesRemaining: 1760,
  dayStatus: 'in-progress' as const,
  entries: [OATS],
}

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

/** [card] is visible and its band draws a divider, [icon] and the body's sides. */
async function expectBand(card: Locator, icon: string) {
  await expect(card).toBeVisible()
  // A CSS icon paints once its icon data has loaded, after hydration.
  await expect
    .poll(() => bandOf(card), { message: icon })
    .toEqual({
      divider: { width: '1px', drawn: true },
      icon: { name: icon, size: '20x20', painted: true, primary: true },
      sides: true,
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
      const today = await pinToLocalMorning(page)
      network.use(
        goalInProgress(),
        summaryOf(loggedDay),
        ...dailyLogs({ [isoShiftDays(today, 1)]: [OATS] }),
      )
      await goto('/', { waitUntil: 'hydration' })

      for (const { name, icon } of TODAYS_CARDS) {
        await expectBand(page.getByRole('region', { name }), icon)
      }
    })

    test('the Goal card draws the same band over Maintenance Mode', async ({
      page,
      goto,
      network,
    }) => {
      await drawEveryIcon(page)
      network.use(
        summaryOf({
          ...loggedDay,
          trendWeightKg: 85.8,
          driftStatus: 'holding',
        }),
      )
      await goto('/', { waitUntil: 'hydration' })

      const goal = page.getByRole('region', { name: 'Goal' })
      await expect(goal.getByText("You're maintaining")).toBeVisible()
      await expectBand(goal, 'target')
      // The Drift Status rides in the band, beside the title.
      await expect(
        goal
          .locator('[data-slot="header"]')
          .getByText('Holding', { exact: true }),
      ).toBeVisible()
    })
  })
}

// ADR 0007: a placeholder waits 150 ms before showing, so a fast answer never
// flashes it. Read at the moment the skeleton is inserted, before any delay —
// on /design's loading specimen, the one card that renders loading.
test("holds a loading card's skeleton invisible for its first moment, under a band shown at once", async ({
  goto,
  page,
}) => {
  await page.addInitScript(() => {
    new MutationObserver(() => {
      const skeleton = document.querySelector<HTMLElement>(
        'section[aria-busy="true"] [data-slot="body"] > [aria-hidden="true"]',
      )
      const band = skeleton
        ?.closest('section')
        ?.querySelector<HTMLElement>('[data-slot="header"]')
      if (skeleton && band && skeleton.dataset.firstOpacity === undefined) {
        skeleton.dataset.firstOpacity = getComputedStyle(skeleton).opacity
        band.dataset.firstOpacity = getComputedStyle(band).opacity
      }
    }).observe(document, { childList: true, subtree: true })
  })

  await goto('/design', { waitUntil: 'hydration' })
  const card = page.locator('section[aria-busy="true"]')
  const skeleton = card.locator('[data-slot="body"] > [aria-hidden="true"]')

  await expect(skeleton).toHaveAttribute('data-first-opacity', '0')
  await expect(card.locator('[data-slot="header"]')).toHaveAttribute(
    'data-first-opacity',
    '1',
  )
  await expect
    .poll(() => skeleton.evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1')
})
