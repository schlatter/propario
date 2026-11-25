import { mkdirSync } from 'node:fs'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { en } from '../src/i18n/en'

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

  // What Propario is at a glance: the comparison, swiping, a duel – three phones side by side.
  const screens = { light: [] as string[], dark: [] as string[] }
  const grab = async () => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.waitForTimeout(300)
      const png = await page.screenshot({ animations: 'disabled', caret: 'hide', clip: { x: 0, y: 0, ...phone } })
      screens[scheme].push(png.toString('base64'))
    }
    await page.emulateMedia({ colorScheme: 'light' })
  }
  // All six sideboards, not only the eligible ones.
  await page.getByRole('button', { name: /^Filter/ }).tap()
  await page.getByRole('button', { name: 'Only eligible' }).tap()
  await page.getByRole('button', { name: /^Filter/ }).tap()
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await grab()
  await page.getByRole('link', { name: 'Swipe' }).click()
  await page.getByRole('heading', { name: 'Like it or not?' }).waitFor()
  await grab()
  await page.goBack()
  await page.getByRole('link', { name: 'Duel' }).click()
  await page.getByText('Which is better?').waitFor()
  // The two candidates and the choice, below the sizes to scale.
  await page.evaluate(() => window.scrollBy(0, 560))
  await grab()
  await page.close()
  await phones(browser, screens)
})

/** The three phone screens in one picture, captioned with the start page's step titles. */
async function phones(browser: Browser, screens: Record<'light' | 'dark', string[]>) {
  const o = en.overview
  const captions = [o.s2Title, o.s4Title, o.s5Title]
  // The app's page, for its fonts and colour tokens; its content is replaced by the picture.
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2, locale: 'en-GB' })
  await page.goto('/')
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.evaluate(
      ({ shots, captions }) => {
        const figures = shots
          .map(
            (src, i) => `
          <figure style="margin:0;width:300px;transform:translateY(${i === 1 ? 0 : 28}px)">
            <div style="padding:9px;border-radius:40px;background:#1b2324;box-shadow:0 0 0 1px var(--line-strong),0 24px 48px -20px rgb(0 0 0 / .35)">
              <img src="data:image/png;base64,${src}" alt="" style="display:block;width:100%;border-radius:31px">
            </div>
            <figcaption style="display:flex;gap:10px;align-items:center;justify-content:center;margin-top:20px;font:650 19px var(--font-display);color:var(--ink)">
              <span style="display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--brand);color:var(--brand-ink);font:700 14px var(--font-ui)">${i + 1}</span>${captions[i]}
            </figcaption>
          </figure>`,
          )
          .join('')
        document.body.innerHTML = `<div id="phones" style="display:flex;gap:48px;justify-content:center;align-items:flex-start;padding:40px 48px 72px;background:var(--bg)">${figures}</div>`
      },
      { shots: screens[scheme], captions },
    )
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(200)
    await page.locator('#phones').screenshot({ path: `${dir}/phones-${scheme}.png` })
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
