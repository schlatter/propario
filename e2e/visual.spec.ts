import { expect, test, type Page } from '@playwright/test'

/**
 * Looks, compared with pictures kept in e2e/visual.spec.ts-snapshots/: catches what no other test
 * sees – something on top of something else, a panel too big for a phone, a colour gone wrong in
 * the dark. The built-in demo (invented products only) on a fixed date, so the pictures stay the
 * same from day to day.
 *
 * After a change people are meant to see, look at the new pictures and keep them:
 * `npm run test:visual:update` (needs `npm run build` first), then commit them.
 */
test.describe.configure({ mode: 'serial' })

const desktop = { width: 1280, height: 800 }
const phone = { width: 390, height: 844 }
const FIXED_DAY = new Date('2026-11-20T10:00:00Z')

async function demo(page: Page) {
  await page.clock.setFixedTime(FIXED_DAY)
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo' }).first().click()
  await page.getByRole('link', { name: /Living-room sideboard/ }).click()
  await page.getByRole('tab', { name: /^Products/ }).waitFor()
  await page.emulateMedia({ reducedMotion: 'reduce' })
}

/** Light and dark, compared with the kept pictures (small anti-aliasing differences allowed). */
async function looks(page: Page, name: string) {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await expect(page).toHaveScreenshot(`${name}-${scheme}.png`, { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01 })
  }
}

test('comparison and "Find and ask" on a desktop', async ({ browser }) => {
  const page = await browser.newPage({ viewport: desktop, locale: 'en-GB' })
  await demo(page)
  await looks(page, 'desktop-table')
  await page.getByRole('button', { name: 'Find and ask' }).click()
  await looks(page, 'desktop-find')
  await page.close()
})

test('"Find and ask" on a phone', async ({ browser }) => {
  const page = await browser.newPage({ viewport: phone, locale: 'en-GB', hasTouch: true, isMobile: true })
  await demo(page)
  await page.getByRole('button', { name: 'Find and ask' }).click()
  const panel = page.getByRole('dialog', { name: 'Find and ask' })
  await looks(page, 'phone-find-search')
  await panel.getByRole('tab', { name: 'Ask AI' }).click()
  await looks(page, 'phone-find-ai')
  await page.close()
})
