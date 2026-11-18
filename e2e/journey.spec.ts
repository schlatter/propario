import AxeBuilder from '@axe-core/playwright'
import { deflateSync } from 'node:zlib'
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test'

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

/** A real PNG of the given size (solid grey), to check that tall pictures stay inside their boxes. */
function png(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (b: Buffer) => {
    let c = 0xffffffff
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, sum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 0, 0, 0, 0], 8) // 8-bit greyscale
  const rows = Buffer.alloc((width + 1) * height, 0x88)
  for (let y = 0; y < height; y++) rows[y * (width + 1)] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

async function inside(img: Locator, box: Locator): Promise<void> {
  const [a, b] = [(await img.boundingBox())!, (await box.boundingBox())!]
  expect(a.y + a.height, 'picture bottom').toBeLessThanOrEqual(b.y + b.height + 1)
  expect(a.x + a.width, 'picture right').toBeLessThanOrEqual(b.x + b.width + 1)
}

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
  // A new entry carries the day it was found and a blue stripe for three days.
  await expect(page.locator('tr.is-new')).toHaveCount(1)
  await expect(page.locator('tr.is-new').getByText(new Date().toLocaleDateString('en-GB'))).toBeVisible()
  await accessible(page, 'comparison')

  await page.getByRole('button', { name: 'Arvika', exact: true }).click()
  // A tall cabinet: 200×1400 px. It must fit its box, not cover the text below.
  await page.locator('.pimg input[type=file]').setInputFiles({ name: 'cabinet.png', mimeType: 'image/png', buffer: png(200, 1400) })
  const picture = page.locator('.pimg-drop img')
  await expect(picture).toHaveAttribute('src', /^\/api\/images\/[0-9a-f-]{36}$/)
  await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  await inside(picture, page.locator('.pimg-drop'))

  // The picture grows on hover; Escape closes the large view, not the details.
  await page.locator('.pimg-drop').hover()
  await expect(page.locator('dialog .thumb-preview img')).toBeVisible()
  await page.mouse.move(0, 0)
  await expect(page.locator('.thumb-preview')).toHaveCount(0)

  // Excluding asks for a kind of reason (filterable) and optional details.
  await page.getByRole('button', { name: 'Excluded', exact: true }).click()
  await page.getByRole('combobox', { name: 'Reason', exact: true }).selectOption('size')
  await page.getByLabel('Details (optional)').fill('too deep')
  await page.getByLabel('Details (optional)').press('Tab')
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Reason', exact: true })).toHaveValue('size')

  // Whoever adds a product found it.
  await expect(page.getByRole('combobox', { name: 'Found by' })).toHaveValue('Ada')

  // Price with its date, the GTIN, and links to look the product up elsewhere (no tracking codes).
  await page.getByLabel('Price', { exact: true }).fill('249')
  await page.getByLabel('GTIN / EAN').fill('4006381 333931')
  await page.getByLabel('Manufacturer part no.').click()
  await expect(page.getByText(/^As of /)).toBeVisible()
  await expect(page.getByLabel('GTIN / EAN')).toHaveValue('4006381333931')
  await expect(page.getByRole('link', { name: 'Geizhals' })).toHaveAttribute('href', 'https://geizhals.de/?fs=4006381333931')
  await expect(page.getByRole('link', { name: 'Stiftung Warentest' })).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(page.getByRole('link', { name: 'Amazon' })).toHaveAttribute('href', 'https://www.amazon.de/s?k=4006381333931')

  // Offers: the first one starts from the product's price; a cheaper total becomes the price.
  await page.getByRole('button', { name: '+ Offer' }).click()
  await expect(page.getByLabel('Price, offer 1')).toHaveValue('249')
  await page.getByRole('button', { name: '+ Offer' }).click()
  await page.getByLabel('Shop, offer 2').fill('Shop B')
  await page.getByLabel('Price, offer 2').fill('199')
  await page.getByLabel('Shipping, offer 2').fill('5')
  await page.getByLabel('Shipping, offer 2').press('Tab')
  await expect(page.getByText('Best €204')).toBeVisible()
  await expect(page.getByLabel('Price', { exact: true })).toHaveValue('204')

  // An outside rating: a known source brings its scale, the value is converted to 0–100.
  await page.getByRole('button', { name: '+ Source' }).click()
  await page.getByLabel('Source, entry 1').fill('Amazon')
  await page.getByLabel('Source, entry 1').press('Tab')
  await expect(page.getByLabel('Scale, source 1')).toHaveValue('stars5')
  await page.getByLabel('Rating, source 1').fill('4.5')
  await page.getByLabel('Rating, source 1').press('Tab')
  await expect(page.getByText('Product: 90/100 from 1 source')).toBeVisible()
  await accessible(page, 'product details')
  await page.keyboard.press('Escape')

  // The same link again – in another spelling – makes no second entry; the existing one opens.
  const countRows = () => page.locator('table.grid tbody tr').count()
  const addLink = async (url: string) => {
    await page.getByRole('button', { name: 'Add product' }).click()
    await page.getByPlaceholder(/shop link/).fill(url)
    await page.keyboard.press('Enter')
    await expect(page.locator('dialog.drawer')).toBeVisible()
    await page.locator('dialog.drawer').getByRole('button', { name: 'Close' }).click()
    await expect(page.locator('dialog.drawer')).toBeHidden()
  }
  await addLink('https://shop.example/regal-1.html')
  await expect.poll(countRows).toBe(2)
  await addLink('https://www.shop.example/regal-1.html/?utm_source=mail')
  await expect.poll(countRows).toBe(2)

  // The selection opens as a small menu of coloured choices; an excluded row is washed in red.
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.getByRole('button', { name: 'Selection: Open' }).last().click()
  await page.locator('.candidate-menu').getByRole('button', { name: 'Excluded' }).click()
  await expect(page.locator('tr.is-excluded')).toHaveCount(1)
  await accessible(page, 'excluded row')
  await page.getByRole('button', { name: 'Selection: Excluded' }).click()
  await page.locator('.candidate-menu').getByRole('button', { name: 'Open' }).click()
  await expect(page.locator('tr.is-excluded')).toHaveCount(0)

  // Selected products can be deleted – after asking twice.
  await page.getByRole('checkbox', { name: 'Select for comparison: shop.example' }).check()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: 'Really delete?' })).toBeVisible()
  await page.getByRole('button', { name: 'Delete for good' }).click()
  await expect.poll(countRows).toBe(1)

  // A rule on the price shows in the price column itself; its header filters by the verdict.
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.getByRole('tab', { name: /Requirements/ }).click()
  await page.getByLabel('Requirement', { exact: true }).fill('Budget')
  await page.getByRole('button', { name: 'Add requirement' }).click()
  await page.getByRole('button', { name: '+ Add automatic check' }).click()
  await page.getByLabel('Value', { exact: true }).fill('250')
  await page.getByLabel('Value', { exact: true }).press('Tab')
  await page.getByRole('tab', { name: /Products/ }).click()
  await expect(page.locator('td.req-pass')).toHaveCount(1)
  await expect(page.locator('.req-bar-row')).toHaveText(/Must.*1\/1/)
  const rule = page.getByRole('button', { name: /Budget\): showing all/ })
  await rule.click() // only met
  await expect(page.getByRole('button', { name: 'Arvika', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Budget\): showing only met/ }).click() // only not met
  await expect(page.getByRole('button', { name: 'Arvika', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: /Budget\): showing only not met/ }).click() // all again
  await expect(page.getByRole('button', { name: 'Arvika', exact: true })).toBeVisible()
  // The budget is a must for every product; the price says how far it is from it.
  await page.getByRole('tab', { name: /Requirements/ }).click()
  await page.getByLabel('Budget (€)').fill('300')
  await page.getByLabel('Budget (€)').press('Tab')
  await page.getByRole('tab', { name: /Products/ }).click()
  await expect(page.getByText('€96 under budget')).toBeVisible()
  // A product can be the price reference instead.
  await page.getByRole('button', { name: 'Arvika', exact: true }).click()
  await page.getByRole('button', { name: 'Use as price reference' }).click()
  await page.locator('dialog.drawer').getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('.price-cell').getByText('price reference')).toBeVisible()
  await accessible(page, 'comparison with rules')

  // Quick filters toggle; the advanced query filters by any field and says what went wrong.
  await page.getByRole('button', { name: 'Favourites' }).click()
  await expect(page.getByRole('button', { name: 'Arvika', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Favourites' }).click()
  await page.getByRole('button', { name: 'Advanced' }).click()
  const queryBox = page.getByLabel('Filter query')
  await queryBox.fill('Price < 250 AND Found by = Ada')
  await expect(page.getByText('1 of 1 products match')).toBeVisible()
  await expect(page).toHaveURL(/q=Price/)
  await queryBox.fill('Price > 250')
  await expect(page.getByRole('button', { name: 'Arvika', exact: true })).toHaveCount(0)
  await queryBox.fill('Depth < 40')
  await expect(page.getByText(/No field called “Depth”/)).toBeVisible()
  await accessible(page, 'advanced filter')
  await queryBox.fill('')
  await page.getByRole('button', { name: 'Advanced' }).click()

  // Double-click on a column's edge: as narrow as the header and values allow, nothing cut off.
  const col = page.locator('col[data-col="retailer"]')
  const before = await col.evaluate((c: HTMLElement) => parseFloat(c.style.width))
  await page.locator('th[data-fit="retailer"] .resizer').dblclick()
  await expect.poll(() => col.evaluate((c: HTMLElement) => parseFloat(c.style.width))).not.toBe(before)
  const label = page.locator('th[data-fit="retailer"] .th-sort > span').first()
  expect(await label.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true)
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

  // Columns move by dragging their header, or with Alt+arrow keys on it.
  const heads = () => page.locator('table.grid thead th[data-col] .th-sort > span:first-child').allTextContents()
  const [first, second] = await heads()
  await page.locator('table.grid thead th[data-col] .th-sort').first().focus()
  await page.keyboard.press('Alt+ArrowRight')
  await expect.poll(async () => (await heads()).slice(0, 2)).toEqual([second, first])
  await page.setViewportSize({ width: 1280, height: 800 })
  const a = (await page.locator('table.grid thead th[data-col]').nth(1).boundingBox())!
  const b = (await page.locator('table.grid thead th[data-col]').nth(0).boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + 4, b.y + b.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect.poll(async () => (await heads()).slice(0, 2)).toEqual([first, second])
  await page.setViewportSize({ width: 390, height: 844 })

  await page.getByRole('link', { name: 'Swipe' }).click()
  await expect(page.getByRole('heading', { name: 'Like it or not?' })).toBeVisible()
  await accessible(page, 'swipe')
  const card = page.locator('.swipe-media img')
  if (await card.count()) {
    await expect.poll(() => card.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    await inside(card, page.locator('.swipe-media'))
  }
  await page.keyboard.press('ArrowRight')
  await expect(page.getByText('1 of 2 decided')).toBeVisible()
  await page.getByRole('button', { name: 'Not for us' }).click()
  await expect(page.getByRole('heading', { name: 'All decided' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Arvika' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to the table' }).click()
  await expect(page.locator('.vote.like')).toHaveCount(1)
  await expect(page.locator('.vote.dislike')).toHaveCount(1)

  // Side by side: the best price green, the worst red, the distance to the best; more products join from there.
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.getByRole('button', { name: 'Price: —' }).click()
  await page.keyboard.type('300')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Add product' }).click()
  await page.getByPlaceholder(/shop link/).fill('Cleo')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await page.getByRole('checkbox', { name: 'Select for comparison: Arvika' }).check()
  await page.getByRole('checkbox', { name: 'Select for comparison: Borre' }).check()
  await page.getByRole('button', { name: /Compare 2/ }).click()
  await expect(page.locator('.num-cell.best').getByText('€204')).toBeVisible()
  await expect(page.locator('.num-cell.worst').getByText('€300')).toBeVisible()
  await expect(page.getByText('+€96 to the best')).toBeVisible()
  await accessible(page, 'side by side')
  await page.getByRole('button', { name: 'Product', exact: true }).click()
  await page
    .getByRole('menuitem', { name: 'Cleo' })
    .or(page.getByRole('button', { name: 'Cleo' }))
    .first()
    .click()
  await expect(page.locator('table.compare thead th[scope=col]')).toHaveCount(3)
  await page.goBack()
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
