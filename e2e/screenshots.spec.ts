import { mkdirSync } from 'node:fs'
import { test, type Page } from '@playwright/test'

/**
 * The pictures in README.md, docs/ and the website: the built-in demo (invented products only),
 * light and dark. `npm run screenshots` writes them to docs/images/; the normal e2e run skips
 * this file. Run it again after a visible change and commit the pictures that changed.
 */
test.skip(!process.env.SCREENSHOTS, 'only with npm run screenshots')
test.describe.configure({ mode: 'serial' })

const dir = 'docs/images'
const desktop = { width: 1440, height: 900 }
const phone = { width: 390, height: 844 }

async function shoot(page: Page, name: string) {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.waitForTimeout(300) // let pictures and transitions settle
    await page.screenshot({ path: `${dir}/${name}-${scheme}.png`, animations: 'disabled', caret: 'hide' })
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

async function demo(page: Page, comparison: RegExp) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo' }).first().click()
  await page.getByRole('link', { name: comparison }).click()
  await page.getByRole('tab', { name: /^Products/ }).waitFor()
  // The pictures show the product; the demo's banner says what the reader already knows.
  await page.addStyleTag({ content: '.demo-bar { display: none !important; }' })
}

test.beforeAll(() => mkdirSync(dir, { recursive: true }))

test('desktop', async ({ browser }) => {
  const page = await browser.newPage({ viewport: desktop, locale: 'en-GB' })
  await demo(page, /Living-room sideboard/)
  // All six products, and no empty space below them.
  await page.getByRole('button', { name: 'Only eligible' }).click()
  await page.setViewportSize({ ...desktop, height: 600 })
  await shoot(page, 'table')
  await page.setViewportSize(desktop)

  await page.getByRole('tab', { name: /^Requirements/ }).click()
  await shoot(page, 'requirements')

  await page.getByRole('tab', { name: /^Products/ }).click()
  for (const name of ['Arvika', 'Kanto', 'Linea']) {
    await page.getByRole('checkbox', { name: new RegExp(`^Select for comparison: .*${name}$`) }).check()
  }
  await page.getByRole('button', { name: /Compare 3/ }).click()
  await page.locator('.size-compare').waitFor()
  await shoot(page, 'side-by-side')
  await page.close()
})

test('phone', async ({ browser }) => {
  const page = await browser.newPage({ viewport: phone, deviceScaleFactor: 2, locale: 'en-GB', hasTouch: true, isMobile: true })
  await demo(page, /Living-room sideboard/)
  await page.getByRole('button', { name: 'Arvika', exact: true }).click()
  await page.locator('dialog.drawer').waitFor()
  // Opened by a tap, not the keyboard: the picture must not show enlarged.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await shoot(page, 'phone-details')
  await page.locator('dialog.drawer').getByRole('button', { name: 'Close', exact: true }).click()

  await page.close()
})

// The six steps of the start page ("What Propario can do"): the website shows the same pictures.
test('steps', async ({ browser }) => {
  const page = await browser.newPage({ viewport: desktop, deviceScaleFactor: 2, locale: 'en-GB' })
  await page.goto('/')
  const steps = page.locator('.overview-step figure.still')
  await steps.first().waitFor()
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.waitForTimeout(300)
    for (let i = 0; i < (await steps.count()); i++) {
      await steps.nth(i).screenshot({ path: `${dir}/step-${i + 1}-${scheme}.png`, animations: 'disabled' })
    }
  }
  await page.close()
})
