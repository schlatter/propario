import { mkdirSync, readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

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
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
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

// The first picture of the README and the website: the table, and over it a lens like the logo's,
// holding the start page's swipe (one product, three buttons). After "steps", whose picture it uses.
test('hero', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 600 }, deviceScaleFactor: 2, locale: 'en-GB' })
  await demo(page, /Living-room sideboard/)
  await page.addStyleTag({ content: '.find-ask { display: none !important; }' })
  await page.getByRole('button', { name: 'Only eligible' }).click()
  await page.mouse.move(0, 0)
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.waitForTimeout(300)
    const table = (await page.screenshot({ animations: 'disabled', caret: 'hide' })).toString('base64')
    const still = readFileSync(`${dir}/step-4-${scheme}.png`).toString('base64')
    await page.evaluate(
      async ({ table, still }) => {
        const picture = new Image()
        picture.src = `data:image/png;base64,${still}`
        await picture.decode()
        // The lens takes the still's own background, so its tile does not show.
        const canvas = document.createElement('canvas')
        canvas.width = picture.width
        canvas.height = picture.height
        const g = canvas.getContext('2d')!
        g.drawImage(picture, 0, 0)
        const [r, gr, bl] = g.getImageData(20, picture.height / 2, 1, 1).data
        const [cx, cy, R, ring, w] = [930, 290, 200, 14, 34]
        const size = 2 * R * 0.9
        const height = size * (picture.height / picture.width)
        const d = R * Math.SQRT1_2 // the handle starts under the ring, so the two touch
        const hero = document.createElement('div')
        hero.id = 'hero'
        hero.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow:hidden'
        hero.innerHTML = `
          <img src="data:image/png;base64,${table}" alt="" style="display:block;width:1440px;height:600px">
          <div style="position:absolute;inset:0;background:color-mix(in srgb, var(--bg) 35%, transparent)"></div>
          <div style="position:absolute;left:${cx + d}px;top:${cy + d - w / 2}px;width:184px;height:${w}px;border-radius:${w / 2}px;background:var(--accent);transform:rotate(45deg);transform-origin:0 50%;box-shadow:0 14px 26px -10px rgb(0 0 0 / .4)"></div>
          <div style="position:absolute;left:${cx - R - ring}px;top:${cy - R - ring}px;width:${2 * R}px;height:${2 * R}px;border-radius:50%;border:${ring}px solid var(--brand);background:rgb(${r} ${gr} ${bl}) url(${picture.src}) no-repeat;background-size:${size}px ${height}px;background-position:${R - size / 2}px ${R - height * 0.48}px;box-shadow:0 26px 60px -14px rgb(0 0 0 / .45)"></div>`
        document.body.append(hero)
        await Promise.all([...hero.querySelectorAll('img')].map((i) => i.decode()))
      },
      { table, still },
    )
    await page.locator('#hero').screenshot({ path: `${dir}/hero-${scheme}.png`, animations: 'disabled' })
    await page.evaluate(() => document.getElementById('hero')?.remove())
  }
  await page.close()
})
