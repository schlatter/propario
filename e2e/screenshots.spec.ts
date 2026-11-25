import { mkdirSync, readFileSync } from 'node:fs'
import { expect, test, type Browser, type Page } from '@playwright/test'

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
  // A tap, as on a phone: a mouse click would leave the pointer over the picture in the details,
  // and the hover preview would show it enlarged on top (#11).
  await page.getByRole('button', { name: 'Arvika', exact: true }).tap()
  await page.locator('dialog.drawer').waitFor()
  await expect(page.locator('.thumb-preview')).toHaveCount(0)
  await shoot(page, 'phone-details')
  await page.locator('dialog.drawer').getByRole('button', { name: 'Close', exact: true }).click()

  // A product being swiped to the right, held mid-gesture: laid over the table in the README's
  // first picture, and over the browser window on the website.
  await page.getByRole('link', { name: 'Swipe' }).click()
  await page.getByRole('heading', { name: 'Like it or not?' }).waitFor()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // Room on the right, so the card that moves there stays in the picture.
  await page.addStyleTag({ content: '.swipe-card { margin-right: 52px; }' })
  const card = (await page.locator('.swipe-card').boundingBox())!
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 3)
  await page.mouse.down()
  await page.mouse.move(card.x + card.width / 2 + 46, card.y + card.height / 3, { steps: 6 })
  const top = (await page.locator('.swipe-page .crumb').boundingBox())!.y - 12
  const bottom = (await page.locator('.swipe-actions').boundingBox())!
  const clip = { x: 0, y: top, width: phone.width, height: bottom.y + bottom.height + 16 - top }
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${dir}/swipe-${scheme}.png`, caret: 'hide', clip })
  }
  await page.mouse.up()
  await page.close()
  await hero(browser)
})

/** The README's first picture: the table as it is, the swipe screen on top of its right side. */
async function hero(browser: Browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 600 }, locale: 'en-GB' })
  await page.goto('/')
  for (const scheme of ['light', 'dark'] as const) {
    const png = (name: string) => `data:image/png;base64,${readFileSync(`${dir}/${name}-${scheme}.png`).toString('base64')}`
    await page.emulateMedia({ colorScheme: scheme })
    await page.evaluate(
      ({ table, swipe }) => {
        document.body.innerHTML = `
          <div id="hero" style="position:relative;width:1440px;height:600px;overflow:hidden;background:var(--bg)">
            <img src="${table}" alt="" style="display:block;width:1440px;height:600px">
            <img src="${swipe}" alt="" style="position:absolute;right:72px;top:50%;transform:translateY(-50%);width:262px;border-radius:18px;border:1px solid var(--line-strong);box-shadow:0 28px 56px -16px rgb(0 0 0 / .4)">
          </div>`
      },
      { table: png('table'), swipe: png('swipe') },
    )
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())))
    await page.locator('#hero').screenshot({ path: `${dir}/hero-${scheme}.png` })
  }
  await page.close()
}

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
