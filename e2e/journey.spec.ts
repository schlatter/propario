import AxeBuilder from '@axe-core/playwright'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'

/**
 * One story, told in order, through the real UI with real WebAuthn ceremonies (Chromium's
 * virtual authenticator stands in for a fingerprint reader):
 *
 *   Ada sets up the instance and keeps a comparison with a product and its picture. She invites
 *   Grace, who joins with her own passkey and sees nothing – comparisons are private. Ada shares
 *   it read-only; Grace now sees it, with the picture, marked "View only". Finally Ada gets back
 *   in with her recovery key, which works exactly once.
 *
 * Every page is checked against WCAG 2.1 AA with axe, in the light and in the dark theme.
 */
test.describe.configure({ mode: 'serial' })

// A valid 2×2 PNG, so the browser can really decode and re-encode it.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64')

async function passkeyDevice(context: BrowserContext, page: Page): Promise<void> {
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
}

/** The main navigation is a collapsible row; open it when needed. */
async function go(page: Page, name: string): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Menu' })
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('link', { name, exact: true }).click()
}

async function accessible(page: Page, name: string): Promise<void> {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const summary = result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
    expect(summary, `${name} (${scheme})`).toEqual([])
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

let ada: { context: BrowserContext; page: Page }
let grace: { context: BrowserContext; page: Page }
let recoveryKey = ''
let inviteLink = ''

test('Ada sets up the instance with a passkey', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await passkeyDevice(context, page)
  ada = { context, page }

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await accessible(page, 'sign in')

  await page.goto(process.env.E2E_SETUP_URL!)
  await expect(page.getByRole('heading', { name: 'Welcome to Propario' })).toBeVisible()
  await accessible(page, 'join')
  await page.getByLabel('Your name').fill('Ada')
  await page.getByRole('button', { name: 'Create passkey and join' }).click()

  const key = page.locator('.recovery-key')
  await expect(key).toBeVisible()
  recoveryKey = (await key.textContent())!.trim()
  expect(recoveryKey).toMatch(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/)
  await accessible(page, 'recovery key')
  await page.getByRole('button', { name: /saved it/ }).click()
  await expect(page.getByRole('heading', { name: 'Comparisons', exact: true })).toBeVisible()
  await accessible(page, 'home (empty)')
})

test('Ada keeps a comparison with a product and its picture', async () => {
  const { page } = ada
  await page.getByRole('button', { name: 'New comparison' }).first().click()
  await page.getByLabel('Name').fill('Kitchen cabinet')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByLabel('Name')).toHaveValue('Kitchen cabinet')

  await page.getByPlaceholder(/shop link/).fill('Arvika')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Arvika', exact: true })).toBeVisible()
  await accessible(page, 'comparison')

  await page.getByRole('button', { name: 'Details: Arvika' }).first().click()
  await page.locator('.pimg input[type=file]').setInputFiles({ name: 'cabinet.png', mimeType: 'image/png', buffer: PNG })
  const picture = page.locator('.pimg-drop img')
  await expect(picture).toHaveAttribute('src', /^\/api\/images\/[0-9a-f-]{36}$/)
  await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  await accessible(page, 'product details')
  await page.keyboard.press('Escape')
})

test('Ada moves rows and decides by swiping', async () => {
  const { page } = ada
  await page.getByRole('button', { name: 'Add product' }).click()
  await page.getByPlaceholder(/shop link/).fill('Borre')
  await page.keyboard.press('Enter')
  const names = () => page.locator('table.grid tbody .name-model').allTextContents()
  await expect.poll(names).toEqual(['Arvika', 'Borre'])

  // The handle moves a row with the keyboard as well as by dragging.
  await page.getByRole('button', { name: 'Move Borre' }).focus()
  await page.keyboard.press('ArrowUp')
  await expect.poll(names).toEqual(['Borre', 'Arvika'])
  const handle = page.getByRole('button', { name: 'Move Borre' })
  const target = page.locator('table.grid tbody tr').nth(1)
  const from = (await handle.boundingBox())!
  const to = (await target.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, to.y + to.height - 4, { steps: 8 })
  await page.mouse.up()
  await expect.poll(names).toEqual(['Arvika', 'Borre'])

  await page.getByRole('link', { name: 'Swipe' }).click()
  await expect(page.getByRole('heading', { name: 'Like it or not?' })).toBeVisible()
  await accessible(page, 'swipe')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByText('1 of 2 decided')).toBeVisible()
  await page.getByRole('button', { name: 'Not for us' }).click()
  await expect(page.getByRole('heading', { name: 'All decided' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Arvika' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to the table' }).click()
  await expect(page.locator('.vote.like')).toHaveCount(1)
  await expect(page.locator('.vote.dislike')).toHaveCount(1)
})

test('Ada invites Grace, who joins and sees nothing that is not hers', async ({ browser }) => {
  const { page } = ada
  await go(page, 'Settings')
  await accessible(page, 'settings')
  await page.getByLabel('For whom (optional)').fill('Grace')
  await page.getByRole('button', { name: 'Create invitation' }).click()
  inviteLink = (await page.locator('.recovery-key.small-key').textContent())!.trim()
  expect(inviteLink).toMatch(/\/join\?invite=/)

  const context = await browser.newContext()
  const gpage = await context.newPage()
  await passkeyDevice(context, gpage)
  grace = { context, page: gpage }
  await gpage.goto(inviteLink)
  await gpage.getByLabel('Your name').fill('Grace')
  await gpage.getByRole('button', { name: 'Create passkey and join' }).click()
  await gpage.getByRole('button', { name: /saved it/ }).click()
  await expect(gpage.getByRole('heading', { name: 'No comparisons yet' })).toBeVisible()

  // The invitation works once.
  const other = await browser.newContext()
  const opage = await other.newPage()
  await passkeyDevice(other, opage)
  await opage.goto(inviteLink)
  await opage.getByLabel('Your name').fill('Mallory')
  await opage.getByRole('button', { name: 'Create passkey and join' }).click()
  await expect(opage.getByRole('alert')).toContainText('invalid, used or expired')
  await other.close()
})

test('shared read-only, Grace sees the comparison and its picture, but may not change it', async () => {
  const { page } = ada
  await go(page, 'Comparisons')
  await page.getByRole('link', { name: 'Kitchen cabinet' }).click()
  await page.getByRole('button', { name: 'Share comparison' }).click()
  await accessible(page, 'share dialog')
  await page.getByLabel('Grace').selectOption('viewer')
  await page.getByRole('button', { name: 'Close' }).click()

  const g = grace.page
  await g.reload()
  await g.getByRole('link', { name: 'Kitchen cabinet' }).click()
  await expect(g.getByText('View only')).toBeVisible()
  const thumb = g.locator('.thumb img').first()
  await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  await expect(g.getByRole('button', { name: 'Share comparison' })).toHaveCount(0)
})

test('the recovery key gets Ada back in exactly once', async ({ browser }) => {
  await go(ada.page, 'Settings')
  await ada.page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(ada.page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('/')
  await page.getByRole('button', { name: /recovery key/ }).click()
  await page.getByLabel('Recovery key').fill(recoveryKey)
  await page.getByRole('button', { name: 'Sign in with recovery key' }).click()
  await expect(page.locator('.recovery-key')).toBeVisible()
  await page.getByRole('button', { name: /saved it/ }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  const again = await browser.newContext()
  const apage = await again.newPage()
  await apage.goto('/')
  await apage.getByRole('button', { name: /recovery key/ }).click()
  await apage.getByLabel('Recovery key').fill(recoveryKey)
  await apage.getByRole('button', { name: 'Sign in with recovery key' }).click()
  await expect(apage.getByRole('alert')).toContainText('not valid')
  await Promise.all([context.close(), again.close(), ada.context.close(), grace.context.close()])
})
