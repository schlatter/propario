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
  // Signed in, the overview is in the menu.
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('link', { name: 'What Propario can do' }).click()
  await expect(page.getByRole('heading', { name: 'Compare faster, decide better.' })).toBeVisible()
  await page.goto('/')
})

test('a visitor sees what Propario does and tries the demo, which never talks to the server', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Compare faster, decide better.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'One link is enough' })).toBeVisible()
  // The way to a decision: sorting out by swiping and duels with sizes to scale are part of it.
  await expect(page.getByRole('heading', { name: 'Sort out quickly' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Settle it in duels' })).toBeVisible()
  // The user guide and the source code are one click away.
  await expect(page.getByRole('link', { name: 'Source code' })).toHaveAttribute('href', 'https://github.com/schlatter/propario')
  await expect(page.getByRole('link', { name: 'User guide' })).toHaveAttribute('href', /docs\/user-guide\.md$/)
  await accessible(page, 'overview')

  // From here on, nothing may reach the server's data.
  const calls: string[] = []
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname
    if (path.startsWith('/api/') && path !== '/api/client-error') calls.push(`${r.method()} ${path}`)
  })
  await page.getByRole('button', { name: 'Try the demo' }).first().click()
  await expect(page.getByRole('status').filter({ hasText: 'Demo – invented data, nothing is saved.' })).toBeVisible()
  // Three invented comparisons of different kinds.
  await expect(page.getByRole('link', { name: /Headphones for the commute/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Robot vacuum for the ground floor/ })).toBeVisible()
  await page.getByRole('link', { name: /Living-room sideboard/ }).click()
  // Filtered, the tab says how many of all are shown; without a filter just how many there are.
  await expect(page.getByRole('tab', { name: /^Products \d\/6$/ })).toBeVisible()
  await page.getByRole('button', { name: /^Filter/ }).click()
  await page.getByRole('button', { name: 'Only eligible' }).click()
  await expect(page.getByRole('tab', { name: /^Products 6$/ })).toBeVisible()
  await page.getByRole('button', { name: 'Only eligible' }).click()
  await page.getByRole('button', { name: /^Filter/ }).click()
  await accessible(page, 'demo comparison')

  // Everything can be tried: a change shows at once …
  await page.getByRole('button', { name: 'Arvika', exact: true }).click()
  await expect(page.locator('.pimg-slide')).toHaveCount(2)
  await page.getByRole('textbox', { name: 'Price', exact: true }).fill('799')
  await page.getByRole('textbox', { name: 'Price', exact: true }).press('Tab')
  await page.locator('dialog.drawer').getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('table.grid tbody tr', { hasText: 'Arvika' }).first()).toContainText('€799')
  // … and what needs a server says so; sharing is not offered at all.
  await expect(page.getByRole('button', { name: 'Share comparison' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Arvika', exact: true }).click()
  await page.getByRole('button', { name: 'Update pictures' }).click()
  await page.getByRole('button', { name: 'Update picture', exact: true }).click()
  await expect(page.getByText('Not in the demo – reading shop pages needs your own account.')).toBeVisible()
  await page.locator('dialog.drawer').getByRole('button', { name: 'Close', exact: true }).click()

  // Arvika's dimension drawing: recognised as one, its front and side view found in it; the
  // front frame is set anew by dragging across the cabinet.
  await page.getByRole('button', { name: 'Arvika', exact: true }).click()
  await page.getByRole('button', { name: 'Show picture 2' }).click()
  await page.getByRole('button', { name: 'Update pictures' }).click()
  await page.getByRole('button', { name: 'Set for 3D' }).click()
  await expect(page.getByRole('heading', { name: 'What does the picture show?' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Dimension drawing' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Front view found – drag to set it anew.')).toBeVisible()
  await page.getByRole('button', { name: 'Side view', exact: true }).click()
  await expect(page.getByText('Side view found – drag to set it anew.')).toBeVisible()
  await page.getByRole('button', { name: 'Front view', exact: true }).click()
  const pic = page.locator('.pview-pic')
  await expect.poll(() => pic.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  const area = (await pic.boundingBox())!
  // The cabinet's front sits at 150–490 × 150–340 of the 640 × 480 drawing.
  await page.mouse.move(area.x + area.width * (150 / 640), area.y + area.height * (150 / 480))
  await page.mouse.down()
  await page.mouse.move(area.x + area.width * (320 / 640), area.y + area.height * (250 / 480), { steps: 4 })
  await page.mouse.move(area.x + area.width * (490 / 640), area.y + area.height * (340 / 480), { steps: 4 })
  await page.mouse.up()
  await expect(pic).toHaveAccessibleName(/from the left 23 %, from the top 31 %, 53 % wide, 40 % high/)
  await accessible(page, 'picture for 3D')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('.pimg-slide .pimg-view')).toHaveText('Dimension drawing')
  // Its form, in 3D from the details: a base and a shallower top, backs against the wall.
  await page.getByRole('button', { name: 'Show in 3D' }).click()
  const one = page.getByRole('dialog', { name: 'Arvika in 3D' })
  await expect(one.locator('canvas')).toHaveCount(1)
  // A finger dragged across the 3D view turns it – it never steps to the next product.
  await one.locator('canvas').evaluate((el) => {
    const at = (x: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 })
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [at(300)], changedTouches: [at(300)], bubbles: true }))
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [at(40)], bubbles: true }))
  })
  await expect(one).toBeVisible()
  await expect(page.locator('#drawer-title')).toContainText('Arvika')
  // The form was read from the drawing's side view when it was saved: the legs stand further in.
  await one.getByRole('button', { name: 'Edit 3D model' }).click()
  await expect(one.locator('.model3d-parts li')).toHaveCount(2)
  await expect(one.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  // Reset: one piece again, saved at once. Opened again, the drawing is read anew.
  await one.getByRole('button', { name: 'Reset' }).click()
  await expect(one.locator('.model3d-parts')).toHaveCount(0)
  await one.getByRole('button', { name: 'Edit 3D model' }).click()
  await expect(one.getByText(/Read from the side view/)).toBeVisible()
  // The size stays: the cut moves, the top part takes the rest.
  await one.locator('.model3d-parts li', { hasText: 'Part 1 (bottom)' }).getByLabel('Height').fill('50')
  await expect(one.getByText('30 cm, the rest')).toBeVisible()
  await one.locator('.model3d-parts li', { hasText: 'Part 2 (top)' }).getByLabel('Depth').fill('30')
  // Deeper than the product is not taken.
  await one.locator('.model3d-parts li', { hasText: 'Part 1 (bottom)' }).getByLabel('Depth').fill('60')
  await expect(one.locator('.model3d-parts li', { hasText: 'Part 1 (bottom)' }).getByLabel('Depth')).toHaveAttribute('aria-invalid', 'true')
  await one.locator('.model3d-parts li', { hasText: 'Part 1 (bottom)' }).getByLabel('Depth').fill('42')
  await accessible(page, 'form in 3D')
  await one.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(one.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  // The photo shows Arvika from an angle: its front's corners set, it is straightened onto the front.
  await one.getByRole('button', { name: 'Put the photo on the front' }).click()
  await expect(page.getByRole('heading', { name: 'What does the picture show?' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Corner / })).toHaveCount(4)
  await page.getByRole('button', { name: 'Corner top right' }).focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await accessible(page, 'corners of the front')
  await page.getByRole('dialog', { name: 'What does the picture show?' }).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(one.getByRole('button', { name: 'Put the photo on the front' })).toHaveCount(0)
  await one.getByRole('button', { name: 'Close' }).click()
  await page.locator('dialog.drawer').getByRole('button', { name: 'Close', exact: true }).click()

  // Side by side, the sizes to scale: Mira is 200 cm wide where the requirements allow 180.
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.getByRole('checkbox', { name: /^Select for comparison: .*Arvika$/ }).check()
  await page.getByRole('checkbox', { name: /^Select for comparison: .*Kanto$/ }).check()
  await page.getByRole('button', { name: /Compare 2/ }).click()
  // Mira is out of the running (too wide), so it joins from here.
  await page.getByRole('button', { name: 'Product', exact: true }).click()
  await page
    .getByRole('menuitem', { name: /Mira/ })
    .or(page.getByRole('button', { name: /Mira/ }))
    .first()
    .click()
  const size = page.locator('.size-compare')
  await expect(size.getByRole('heading', { name: 'Size' })).toBeVisible()
  await expect(size.locator('figcaption', { hasText: 'Mira' })).toContainText('Width 200 cm (too big), Height 78 cm')
  await expect(size.locator('figcaption', { hasText: 'Arvika' }).locator('.over')).toHaveCount(0)
  await expect(size.getByText('Width: at most 180 cm')).toBeVisible()
  await size.getByRole('button', { name: 'From above' }).click()
  await expect(size.getByRole('button', { name: 'From above' })).toHaveAttribute('aria-pressed', 'true')
  await expect(size.getByText('Width: at most 180 cm · Depth: at most 45 cm')).toBeVisible()
  await expect(size.locator('.size-over').first()).toBeVisible()
  await accessible(page, 'sizes to scale')
  // On a phone, all of it fits the width: nothing to scroll sideways in the front view.
  await page.setViewportSize({ width: 390, height: 844 })
  await size.getByRole('button', { name: 'Front', exact: true }).click()
  expect(await size.locator('.size-scroll').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await accessible(page, 'sizes to scale on a phone')
  // The marked drawing stands for Arvika's front.
  // Arvika's front: the photo, straightened from its corners.
  await expect(size.locator('.size-col', { hasText: 'Arvika' }).locator('image[href^="data:image/jpeg"]')).toHaveCount(1)
  // From the side, Arvika's form shows its step: two parts.
  await size.getByRole('button', { name: 'Side', exact: true }).click()
  await expect(size.locator('.size-col', { hasText: 'Arvika' }).locator('.size-line')).toHaveCount(2)
  await size.getByRole('button', { name: 'Front', exact: true }).click()
  // The products can also be laid one over the other – three here, each with its own line …
  await size.getByRole('button', { name: 'Overlaid' }).click()
  await expect(size.locator('.size-col.overlay .size-cap')).toHaveCount(3)
  await expect(size.locator('.size-col.overlay .size-fig .size-body')).toHaveCount(3)
  await expect(size.locator('.size-col.overlay .size-fig .size-body.t2')).toHaveCount(1)
  await accessible(page, 'sizes overlaid')
  // … and two, as in a duel.
  await page.getByRole('button', { name: 'Remove from comparison' }).last().click()
  await expect(size.locator('.size-col.overlay .size-fig .size-body')).toHaveCount(2)
  // In 3D: boxes of the real size to turn; three.js loads only now. No AR on this device: no button for it.
  await size.getByRole('button', { name: 'Show the products in 3D' }).click()
  const model = page.getByRole('dialog', { name: '3D view' })
  await expect(model).toBeVisible()
  await expect(model.locator('canvas')).toHaveCount(1)
  await expect(model.getByRole('img', { name: /next to a person 1.75 m tall: Arvika, Kanto/ })).toBeVisible()
  await model.getByRole('button', { name: 'Turn left' }).click()
  await expect(model.getByRole('button', { name: 'View in your room' })).toHaveCount(0)
  await accessible(page, '3D view')
  await model.getByRole('button', { name: 'Close' }).click()
  await expect(model).toBeHidden()
  expect(calls).toEqual([])

  // Ending the demo removes its data from the browser.
  await page.getByRole('button', { name: 'End demo' }).click()
  await expect(page.getByRole('heading', { name: 'Compare faster, decide better.' })).toBeVisible()
  await expect.poll(() => page.evaluate(async () => (await indexedDB.databases()).some((d) => d.name === 'propario-demo'))).toBe(false)
  await context.close()
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

  // By default only products still in the running show; the steps below want to see all.
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(page.getByRole('button', { name: 'Only eligible' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Only eligible' }).click()
  await expect(page).toHaveURL(/chips=none/)
  await page.setViewportSize({ width: 390, height: 844 })

  // Installable app: a service worker that shows a friendly page without a connection.
  expect(await page.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active))).toBe(true)
  await page.context().setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Propario ist gerade nicht erreichbar' })).toBeVisible()
  await page.context().setOffline(false)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Arvika', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Arvika', exact: true }).click()
  // A tall cabinet: 200×1400 px. It must fit its box, not cover the text below.
  await page.locator('.pimg input[data-pick=add]').setInputFiles({ name: 'cabinet.png', mimeType: 'image/png', buffer: png(200, 1400) })
  const picture = page.locator('.pimg-slide img').first()
  await expect(picture).toHaveAttribute('src', /^\/api\/images\/[0-9a-f-]{36}$/)
  await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  await inside(picture, page.locator('.pimg-stage'))

  // The picture grows on hover; Escape closes the large view, not the details.
  await page.locator('.pimg-stage').hover()
  await expect(page.locator('dialog .thumb-preview img')).toBeVisible()
  await page.mouse.move(0, 0)
  await expect(page.locator('.thumb-preview')).toHaveCount(0)

  // A further picture (e.g. a dimension drawing): added; the gallery opens at the main picture,
  // steps on, and its star makes another picture the main one. Escape closes only the gallery.
  const mainSrc = await picture.getAttribute('src')
  await page.locator('.pimg input[data-pick=add]').setInputFiles({ name: 'drawing.png', mimeType: 'image/png', buffer: png(600, 300) })
  await expect(page.locator('.pimg-slide')).toHaveCount(2)
  // A swipe on the pictures shows the next picture, not the next product.
  const titleBefore = await page.locator('#drawer-title').textContent()
  await page.locator('.pimg-track').evaluate((el) => el.scrollTo({ left: el.clientWidth, behavior: 'instant' }))
  await expect(page.getByRole('button', { name: 'Show picture 2' })).toHaveAttribute('aria-current', 'true')
  await page.locator('.pimg-stage').evaluate((el) => {
    const at = (x: number) => [new Touch({ identifier: 1, target: el, clientX: x, clientY: 200 })]
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: at(300), changedTouches: at(300) }))
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: at(120) }))
  })
  await expect(page.locator('#drawer-title')).toHaveText(titleBefore!)
  await page.getByRole('button', { name: 'Show picture 1' }).click()
  await expect(page.getByRole('button', { name: 'Show picture 1' })).toHaveAttribute('aria-current', 'true')
  // With a mouse, arrows at the picture's edges step too – and do not open the gallery.
  await expect(page.locator('.pimg-nav.prev')).toBeHidden()
  await page.locator('.pimg-nav.next').click()
  await expect(page.getByRole('button', { name: 'Show picture 2' })).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('.pimg-nav.next')).toBeHidden()
  await page.locator('.pimg-nav.prev').click()
  await expect(page.getByRole('button', { name: 'Show picture 1' })).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('dialog.gallery')).toBeHidden()
  await page.locator('.pimg-stage').click()
  await expect(page.locator('dialog.gallery')).toBeVisible()
  await expect(page.locator('.gallery-count')).toHaveText('1/2')
  // A swipe in the gallery changes the picture, not the product.
  const productTitle = await page.locator('#drawer-title').textContent()
  await page.locator('.gallery-inner').evaluate((el) => {
    const at = (x: number) => [new Touch({ identifier: 1, target: el, clientX: x, clientY: 400 })]
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: at(300), changedTouches: at(300) }))
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: at(120) }))
  })
  await expect(page.locator('.gallery-count')).toHaveText('2/2')
  await expect(page.locator('#drawer-title')).toHaveText(productTitle!)
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.gallery-count')).toHaveText('1/2')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.gallery-count')).toHaveText('2/2')
  await page.getByRole('button', { name: 'Make main picture' }).click()
  await expect(page.locator('.gallery-count')).toHaveText('1/2')
  await expect(page.locator('.gallery-star')).toBeDisabled()
  await accessible(page, 'gallery')
  await page.keyboard.press('Escape')
  await expect(page.locator('dialog.gallery')).toBeHidden()
  await expect(page.locator('dialog.drawer')).toBeVisible()
  await expect(picture).not.toHaveAttribute('src', mainSrc!)
  await page.getByRole('button', { name: 'Show picture 2' }).click()
  await page.locator('.pimg-stage').click()
  await page.getByRole('button', { name: 'Make main picture' }).click()
  await page.keyboard.press('Escape')
  await expect(picture).toHaveAttribute('src', mainSrc!)
  await page.getByRole('button', { name: 'Show picture 2' }).click()
  await page.getByRole('button', { name: 'Update pictures' }).click()
  await page.getByRole('button', { name: 'Remove picture 2' }).click()
  await expect(page.locator('.pimg-slide')).toHaveCount(1)

  // Ctrl+V anywhere in the details adds a picture – two quick pastes add two; the main picture
  // is never replaced. A paste into a text field stays text.
  const paste = (target: string, width: number) =>
    page.locator(target).evaluate((el, b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const data = new DataTransfer()
      data.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }))
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    }, png(width, 200).toString('base64'))
  await paste('#drawer-title', 400)
  await paste('#drawer-title', 500)
  await expect(page.locator('.pimg-slide')).toHaveCount(3)
  await expect(picture).toHaveAttribute('src', mainSrc!)
  await paste('dialog.drawer textarea >> nth=0', 300)
  await expect(page.locator('.pimg-slide')).toHaveCount(3)
  for (const n of [3, 2]) {
    await page.getByRole('button', { name: `Show picture ${n}` }).click()
    await page.getByRole('button', { name: 'Update pictures' }).click()
    await page.getByRole('button', { name: `Remove picture ${n}` }).click()
  }
  await expect(page.locator('.pimg-slide')).toHaveCount(1)

  // An upright further picture – stored larger than the main one – fits the gallery whole on a
  // laptop, and the magnifier enlarges it in the middle instead of pushing it to the left.
  const size = page.viewportSize()!
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.locator('.pimg input[data-pick=add]').setInputFiles({ name: 'tall.png', mimeType: 'image/png', buffer: png(300, 1400) })
  await expect(page.locator('.pimg-slide')).toHaveCount(2)
  await page.getByRole('button', { name: 'Show picture 2' }).click()
  await page.locator('.pimg-stage').click()
  const stage = page.locator('.gallery-stage')
  const shown = page.locator('.gallery-picture img')
  await expect.poll(() => shown.evaluate((img: HTMLImageElement) => img.naturalHeight)).toBeGreaterThan(640)
  await inside(shown, stage)
  const drawnWidth = await shown.evaluate((img: HTMLImageElement) => (img.naturalWidth * img.clientHeight) / img.naturalHeight)
  await page.getByRole('button', { name: 'Show at full size' }).click()
  const [z, s] = [(await shown.boundingBox())!, (await stage.boundingBox())!]
  expect(z.width).toBeGreaterThan(drawnWidth * 2)
  expect(Math.abs(z.x + z.width / 2 - (s.x + s.width / 2)), 'enlarged picture centred').toBeLessThan(2)
  await page.getByRole('button', { name: 'Fit to the screen' }).click()
  await inside(shown, stage)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Show picture 2' }).click()
  await page.getByRole('button', { name: 'Update pictures' }).click()
  await page.getByRole('button', { name: 'Remove picture 2' }).click()
  await expect(page.locator('.pimg-slide')).toHaveCount(1)
  // A single picture is no scroll region, whatever widths the layout rounds to.
  await expect(page.locator('.pimg-track')).toHaveCSS('overflow-x', 'hidden')
  await page.setViewportSize(size)
  await accessible(page, 'further pictures')

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
  // Price searches sit with the offers, tests with tests and reviews.
  await expect(page.locator('.section', { has: page.getByRole('heading', { name: /^Offers/ }) }).getByRole('link', { name: 'Geizhals' })).toBeVisible()
  await expect(
    page.locator('.section', { has: page.getByRole('heading', { name: /^Tests & reviews/ }) }).getByRole('link', { name: 'Stiftung Warentest' }),
  ).toBeVisible()
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

  // A shop that refuses automated access (some answer with a bot check): the app says so instead
  // of staying silent, and takes what the address itself names – without any further request.
  await page.route('**/api/product-image?**', (route) => route.fulfill({ status: 422, json: { error: 'blocked' } }))
  await addLink('https://www.moebel.example/p/nordhaus-sideboard-mit-led-beleuchtung-in-landhaus-stil-1-st-AB12CD34/?variationId=AB12CD34EF')
  await page.unroute('**/api/product-image?**')
  await expect(page.getByText(/moebel\.example: The shop refuses automated access.*Taken from the address instead/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nordhaus Sideboard mit Led Beleuchtung in Landhaus Stil', exact: true })).toBeVisible()
  await page.getByRole('checkbox', { name: /Select for comparison: Nordhaus Sideboard/ }).check()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click()
  await page.getByRole('button', { name: 'Delete for good' }).click()
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
  await page.getByLabel('Value: Budget', { exact: true }).fill('250')
  await page.getByLabel('Value: Budget', { exact: true }).press('Tab')
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
  await page.getByLabel('At most', { exact: true }).fill('300')
  await page.getByLabel('At most', { exact: true }).press('Tab')
  await expect(page.getByRole('combobox', { name: 'Priority: At most' })).toHaveValue('must')
  // An optional minimum with its own priority; as a must it blocks a product that is too cheap.
  await page.getByLabel('At least (optional)', { exact: true }).fill('250')
  await page.getByLabel('At least (optional)', { exact: true }).press('Tab')
  await page.getByRole('combobox', { name: 'Priority: At least (optional)' }).selectOption('must')
  await expect(page.getByText(/Your own price rule \(“Budget”\)/)).toBeVisible()
  await accessible(page, 'budget')
  await page.getByRole('tab', { name: /Products/ }).click()
  await expect(page.getByText('€46 below the minimum')).toBeVisible()
  await page.getByRole('tab', { name: /Requirements/ }).click()
  await page.getByLabel('At least (optional)', { exact: true }).fill('')
  await page.getByLabel('At least (optional)', { exact: true }).press('Tab')
  await page.getByRole('tab', { name: /Products/ }).click()
  await expect(page.getByText('€96 under budget')).toBeVisible()
  // An own price rule moves into the budget with one click (after a question), and is gone.
  await page.getByRole('tab', { name: /Requirements/ }).click()
  await page.getByRole('button', { name: 'Take “Budget” into the budget' }).click()
  await page.getByRole('button', { name: 'Take into budget' }).click()
  await expect(page.getByLabel('At most', { exact: true })).toHaveValue('250')
  await expect(page.getByRole('button', { name: /Take “Budget”/ })).toHaveCount(0)
  await page.getByLabel('At most', { exact: true }).fill('300')
  await page.getByLabel('At most', { exact: true }).press('Tab')
  await page.getByRole('tab', { name: /Products/ }).click()
  await expect(page.getByText('€96 under budget')).toBeVisible()
  // A product can be the price reference instead.
  await page.getByRole('button', { name: 'Arvika', exact: true }).click()
  await page.locator('dialog.drawer').getByRole('button', { name: 'More' }).click()
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

  // On a phone the quick filters fold away, and the fixed columns leave room for the others.
  await expect(page.getByRole('button', { name: 'Favourites' })).toBeHidden()
  await page.getByRole('button', { name: /^Filter/ }).click()
  await expect(page.getByRole('button', { name: 'Favourites' })).toBeVisible()
  await page.getByRole('button', { name: /^Filter/ }).click()
  const nameWidth = await page.locator('table.grid thead th.col-name').evaluate((th) => th.getBoundingClientRect().width)
  // Wide enough for a picture people can recognise (52 px), still under half the screen.
  expect(nameWidth).toBeLessThanOrEqual(176)
  expect(
    await page
      .locator('table.grid tbody .name-cell .thumb')
      .first()
      .evaluate((t) => t.getBoundingClientRect().width),
  ).toBeGreaterThanOrEqual(52)
  await accessible(page, 'table on a phone')

  await page.getByRole('link', { name: 'Swipe' }).click()
  await expect(page.getByRole('heading', { name: 'Like it or not?' })).toBeVisible()
  await accessible(page, 'swipe')
  const card = page.locator('.swipe-media img')
  if (await card.count()) {
    await expect.poll(() => card.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    await inside(card, page.locator('.swipe-media'))
  }
  // A star of one's own right on the card; the picture opens large without casting a vote.
  const cardStar = page.locator('.swipe-card').getByRole('button', { name: 'Favourite' })
  await cardStar.click()
  await expect(cardStar).toHaveAttribute('aria-pressed', 'true')
  if (await card.count()) {
    await page.locator('.swipe-zoom').click()
    await expect(page.locator('dialog.gallery')).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Escape')
    await expect(page.locator('dialog.gallery')).toBeHidden()
    await expect(page.getByRole('status', { name: '0 of 2 decided' })).toBeVisible()
  }
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('status', { name: '1 of 2 decided' })).toBeVisible()
  await page.getByRole('button', { name: 'Dislike', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'All decided' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Arvika' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to the table' }).click()
  // The table shows each one's own verdict as its symbol.
  await expect(page.locator('.verdict-trigger.like')).toHaveCount(1)
  await expect(page.locator('.verdict-trigger.dislike')).toHaveCount(1)

  // A swipe in the wrong direction is put right in the details, where the verdict can be given too.
  await page
    .locator('table.grid tbody tr', { has: page.locator('.verdict-trigger.dislike') })
    .locator('.name-model')
    .click()
  // The details show one's own verdict as in the table; a tap opens the three choices.
  const verdict = page.locator('dialog.drawer .verdict-trigger')
  await expect(verdict).toHaveAccessibleName('Your verdict: I don’t like it')
  await verdict.click()
  await page
    .locator('.verdict-menu')
    .getByRole('button', { name: /^I like it/ })
    .click()
  await expect(verdict).toHaveAccessibleName('Your verdict: I like it')
  // Voting made it checked; the star is its own, for everyone.
  await expect(page.getByRole('group', { name: 'Selection' }).getByRole('button', { name: 'Checked' })).toHaveAttribute('aria-pressed', 'true')
  await page
    .locator('dialog.drawer')
    .getByRole('button', { name: /Favourite/ })
    .click()
  await expect(page.locator('dialog.drawer').getByRole('button', { name: /Favourite/ })).toHaveAttribute('aria-pressed', 'true')
  // The price shows its currency.
  await expect(page.locator('dialog.drawer .input-affix .affix')).toHaveText('€')
  await expect(page.getByRole('textbox', { name: 'Price', exact: true })).toBeVisible()
  // Every free-text field says what belongs in it.
  await expect(page.getByRole('textbox', { name: 'Comments', exact: true })).toHaveAccessibleDescription(/Everything else about this product/)
  await expect(page.getByRole('textbox', { name: 'Description', exact: true })).toHaveAccessibleDescription(/usually taken from the shop page/)
  await expect(page.getByText('Notes (seen by everyone in this comparison)')).toHaveCount(0)
  await accessible(page, 'details with verdict')
  await page.locator('dialog.drawer').getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('.verdict-trigger.like')).toHaveCount(2)
  await expect(page.locator('.verdict-trigger.dislike')).toHaveCount(0)
  // The verdict is set right in the table too: only one's own shows; without one, neutral (paler).
  const trigger = page.locator('table.grid tbody tr').first().locator('.verdict-trigger')
  await expect(trigger).toHaveAccessibleName('Your verdict: I like it')
  await trigger.click()
  await page
    .locator('.verdict-menu')
    .getByRole('button', { name: /^I like it/ })
    .click()
  await expect(trigger).toHaveAccessibleName('Your verdict: none yet')
  await expect(trigger).toHaveClass(/unset/)
  await expect(trigger).not.toHaveClass(/neutral/)
  await trigger.click()
  await accessible(page, 'table with verdict menu')
  await page
    .locator('.verdict-menu')
    .getByRole('button', { name: /^I like it/ })
    .click()
  await expect(trigger).toHaveAccessibleName('Your verdict: I like it')

  // Duels: the product holding first place on the left, the challenger on the right; the
  // winner takes the place. Two products: one duel decides – and can become the decision.
  const tableUrl = page.url()
  await page.goto(tableUrl.replace(/\?.*$/, '') + '/compare?mode=duel')
  await expect(page.getByText('Which is better?')).toBeVisible()
  await expect(page.getByText('1 duel to first place')).toBeVisible()
  const [leftName, rightName] = await page.locator('.duel-choices .duel-name').allTextContents()
  await accessible(page, 'duel')
  // With two products there is no other duel to play first: nothing to skip.
  await expect(page.getByRole('button', { name: 'Later' })).toHaveCount(0)
  await page.keyboard.press('ArrowRight')
  await expect(page.getByText('Your ranking is complete.')).toBeVisible()
  await expect(page.locator('.ranking-table tbody tr').first()).toContainText(rightName)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.duel-choices .duel-name')).toHaveText([leftName, rightName])
  await page.locator('.duel-choices .btn').first().click()
  await expect(page.locator('.ranking-table tbody tr').first()).toContainText(leftName)
  await page.getByRole('button', { name: `${leftName} as the decision` }).click()
  await expect(page.locator('.ranking-table tr.is-decision')).toContainText(leftName)
  await page.goto(tableUrl)
  // The table now shows the place and is sorted by it; from "Place", the manual order can return.
  await expect(page.locator('table.grid tbody tr').first()).toContainText(leftName)
  await expect(page.locator('table.grid tbody tr').first().locator('.rank-cell')).toHaveText('1')
  await expect(page.locator('table.grid thead th[data-fit="rank"]')).toHaveAttribute('aria-sort', 'ascending')

  // Without a connection a change shows at once, is taken back when it cannot be saved, and the
  // app says so – it never waits with nothing happening.
  await page.locator('table.grid tbody .name-model').first().click()
  const selection = page.getByRole('group', { name: 'Selection' })
  const chosen = await selection.locator('[aria-pressed="true"]').textContent()
  await page.context().setOffline(true)
  await selection.getByRole('button', { name: 'Excluded' }).click()
  await expect(page.getByText('No connection to the server – the change was not saved.')).toBeVisible()
  await expect(selection.locator('[aria-pressed="true"]')).toHaveText(chosen!)
  await page.context().setOffline(false)
  await page.locator('dialog.drawer').getByRole('button', { name: 'Close', exact: true }).click()

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

  // "Share → Propario" from another app: the link lands in the chosen comparison, once.
  const shared = '/share?title=Regal%20Cleo&text=Schau%20mal%3A%20https%3A%2F%2Fshop.example%2Fcleo-7.html'
  await page.goto(shared)
  await expect(page.getByRole('heading', { name: 'Add a shared product' })).toBeVisible()
  await accessible(page, 'share target')
  await page.getByRole('button', { name: /Kitchen cabinet/ }).click()
  await expect(page.locator('dialog.drawer')).toBeVisible()
  await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}\?product=/)
  await page.locator('dialog.drawer').getByRole('button', { name: 'Close' }).click()
  const before = await page.locator('table.grid tbody tr').count()
  await page.goto(shared)
  await page.getByRole('button', { name: /Kitchen cabinet/ }).click()
  await expect(page.locator('dialog.drawer')).toBeVisible()
  await page.locator('dialog.drawer').getByRole('button', { name: 'Close' }).click()
  await expect.poll(() => page.locator('table.grid tbody tr').count()).toBe(before)
  // Tidy up for the steps that follow.
  await page.getByRole('checkbox', { name: 'Select for comparison: shop.example' }).check()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click()
  await page.getByRole('button', { name: 'Delete for good' }).click()

  // One "Export" entry opens the formats.
  await page.getByRole('button', { name: 'More', exact: true }).first().click()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Export as Excel' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export as JSON' })).toBeVisible()
  await page.keyboard.press('Escape')

  // "Find and ask", bottom right. Without AI: the shops' search for the comparison's name.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'Find and ask' }).click()
  const panel = page.getByRole('dialog', { name: 'Find and ask' })
  await expect(panel.getByRole('searchbox', { name: 'Search for' })).toBeFocused()
  await panel.getByRole('searchbox', { name: 'Search for' }).fill('wall cabinet')
  await expect(panel.getByRole('link', { name: 'Geizhals' })).toHaveAttribute('href', 'https://geizhals.de/?fs=wall%20cabinet')
  await expect(panel.getByRole('link', { name: 'idealo' })).toHaveAttribute('target', '_blank')
  // With one's own AI: a request for more products …
  await panel.getByRole('button', { name: 'Ask my AI for more' }).click()
  await expect(page.getByText('Copied – paste it into the AI you use.')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Suggest up to 5 more products')
  // … or one's own question; the comparison goes with it, without names of people.
  await panel.getByRole('textbox', { name: 'Your question' }).fill('Which is the quietest?')
  await panel.getByRole('button', { name: 'Copy for my AI' }).click()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toContain('# Kitchen cabinet')
  expect(copied).toContain('Which is the quietest?')
  expect(copied).toContain('### Arvika')
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Find and ask' })).toBeFocused()

  // The AI answers with the table from the copy: one product changed, one new. Pasted back, the
  // first updates its product and the second is added – after a preview.
  const tableLines = copied.slice(copied.indexOf('## Products as a table')).split('\n')
  const header = tableLines.find((l) => l.startsWith('| '))!
  const cols = header.split('|').map((c) => c.trim())
  const arvikaRow = tableLines.find((l) => /\| Arvika \|/.test(l))!.split('|')
  arvikaRow[cols.indexOf('Price')] = ' 244 '
  const newRow = cols.map((c) => (c === 'Model' ? ' Dora ' : c === 'Price' ? ' 299 ' : c === '' ? '' : ' '))
  const answer = `Here is the updated table:\n\n${header}\n${tableLines[tableLines.indexOf(header) + 1]}\n${arvikaRow.join('|')}\n${newRow.join('|')}\n\nGood luck!`
  await page.getByRole('button', { name: 'More', exact: true }).first().click()
  await page.getByRole('button', { name: 'Add or update products' }).click()
  await page.getByLabel('Table', { exact: true }).fill(answer)
  await page.getByRole('button', { name: 'Read table' }).click()
  await expect(page.getByRole('status').filter({ hasText: '1 new, 1 with changes' })).toBeVisible()
  await expect(page.locator('.merge-item.update')).toContainText('€244')
  await accessible(page, 'merge preview')
  await page.getByRole('button', { name: 'Add 1, update 1' }).click()
  await expect(page.getByText('1 added, 1 updated.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Dora', exact: true })).toBeVisible()
  await expect(page.locator('table.grid tbody tr', { hasText: 'Arvika' })).toContainText('244')

  // In the details, ← → (or a swipe on a phone) step through the products in the table's order.
  await page.goto(page.url().replace(/\?.*$/, ''))
  await page.locator('table.grid tbody .name-model').first().click()
  const firstName = await page.locator('#drawer-title').textContent()
  await expect(page.locator('.step-count')).toHaveText(/^1\//)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.step-count')).toHaveText(/^2\//)
  await expect(page.locator('#drawer-title')).not.toHaveText(firstName!)
  await expect(page.locator('#drawer-title')).toBeFocused()
  await page.getByRole('button', { name: 'Previous product' }).click()
  await expect(page.locator('#drawer-title')).toHaveText(firstName!)
  // A swipe to the left (a finger moving right to left) shows the next product.
  await page.locator('.drawer-inner').evaluate((el) => {
    const at = (x: number) => [new Touch({ identifier: 1, target: el, clientX: x, clientY: 400 })]
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: at(300), changedTouches: at(300) }))
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: at(120) }))
  })
  await expect(page.locator('.step-count')).toHaveText(/^2\//)
  await accessible(page, 'stepping through products')
  await page.locator('dialog.drawer').getByRole('button', { name: 'Close' }).click()

  // Requirements: a missing field is created from the requirement's words, weights are shown,
  // and a row moves into another group with the keyboard on its handle.
  await page.goto(page.url().replace(/\?.*$/, '') + '?tab=requirements')
  const addReq = async (label: string, category: string) => {
    await page.locator('form.quick-add input[aria-label="Requirement"]').fill(label)
    await page.locator('form.quick-add input[aria-label="Category"]').fill(category)
    await page.locator('form.quick-add select[aria-label="Priority"]').selectOption('wish')
    await page.getByRole('button', { name: 'Add requirement' }).click()
    await expect(page.getByRole('textbox', { name: 'Requirement', exact: true }).last()).toHaveValue(label)
  }
  await addReq('Maximale Tiefe 40 cm', 'Size')
  await page.getByRole('button', { name: '+ New field “Tiefe” (cm)' }).click()
  await expect(page.getByLabel('Value: Maximale Tiefe 40 cm')).toHaveValue('40')
  await expect(page.getByRole('tab', { name: /Fields 1/ })).toBeVisible()
  // Fields are a table like the requirements: edited in place, moved by their handle.
  await page.getByRole('tab', { name: /Fields 1/ }).click()
  await expect(page.locator('table.fields-table tbody tr')).toHaveCount(1)
  await expect(page.getByLabel('Unit: Tiefe')).toHaveValue('cm')
  await page.getByLabel('When comparing: Tiefe').selectOption('lower')
  await expect(page.getByLabel('When comparing: Tiefe')).toHaveValue('lower')
  // The tab bar has nothing to scroll on a desktop, so no empty scroll bar.
  expect(await page.locator('.tabs').evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true)
  await accessible(page, 'fields table')
  await page.getByRole('tab', { name: /Requirements/ }).click()
  await addReq('Soft close', 'Comfort')
  await expect(page.locator('tr:has(input[value="Soft close"]) .weight-cell')).toHaveText('2 · 50 %')
  await page.getByRole('button', { name: 'Move Soft close' }).focus()
  await page.keyboard.press('ArrowUp')
  await expect(page.getByLabel('Category: Soft close')).toHaveValue('Size')
  await accessible(page, 'requirements table')

  // The start page points at what is new.
  await page.goto('/')
  await page
    .getByRole('link', { name: /\d+ new/ })
    .first()
    .click()
  await expect(page).toHaveURL(/chips=new/)
})

test('Ada invites Grace, who joins and sees nothing that is not hers', async ({ browser }) => {
  const { page } = ada
  await go(page, 'Settings')
  await accessible(page, 'settings')
  await expect(page.getByRole('link', { name: 'Source code' })).toHaveAttribute('href', 'https://github.com/schlatter/propario')
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

test('troubleshooting: a detailed log on one device and a support package without contents', async () => {
  const { page } = ada
  await go(page, 'Settings')
  await page.getByRole('checkbox', { name: 'Detailed log on this device' }).check()
  await go(page, 'Comparisons')
  await page.getByRole('link', { name: 'Kitchen cabinet' }).click()
  await page.locator('table.grid tbody .name-model').first().click()
  const selection = page.getByRole('group', { name: 'Selection' })
  const was = (await selection.locator('[aria-pressed="true"]').textContent())!
  await selection.getByRole('button', { name: was === 'Checked' ? 'Open' : 'Checked', exact: true }).click()
  await selection.getByRole('button', { name: was, exact: true }).click()
  await expect.poll(() => page.evaluate(() => (localStorage.getItem('pv.debug.log') ?? '').includes('saved in'))).toBe(true)
  await page.locator('dialog.drawer').getByRole('button', { name: 'Close', exact: true }).click()
  await go(page, 'Settings')
  await expect(page.getByText(/\d+ entries logged so far/)).toBeVisible()
  await accessible(page, 'settings with troubleshooting')

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download support package' }).click()
  const file = await (await download).path()
  const text = (await import('node:fs')).readFileSync(file, 'utf8')
  const pack = JSON.parse(text)
  expect(pack).toMatchObject({ app: 'propario-support', startStep: 'ready', log: { on: true } })
  expect(pack.records.products).toBeGreaterThan(0)
  expect(pack.log.entries.some((e: { kind: string; text: string }) => e.kind === 'request' && /^POST \/api\/changes 200/.test(e.text))).toBe(true)
  // Technical only: no names of comparisons or products.
  expect(text).not.toContain('Kitchen cabinet')
  expect(text).not.toContain('Arvika')
  await page.getByRole('checkbox', { name: 'Detailed log on this device' }).uncheck()
})

test('after an update, a long-open app reloads itself instead of going blank', async () => {
  const { page, context } = ada
  // A page started before the update, which has not loaded the import parts yet.
  await page.goto('/')
  await page.getByRole('link', { name: 'Kitchen cabinet' }).click()
  await expect(page.getByRole('tab', { name: /Products/ })).toBeVisible()

  // The server now runs a newer version and no longer has the old page's files.
  // (The new version's service worker has also cleared the old version's cached files.)
  let gone = true
  await page.evaluate(async () => Promise.all((await caches.keys()).map((k) => caches.delete(k))))
  await context.route('**/version.json', (route) => route.fulfill({ json: { version: '99.0.0+newer' } }))
  await context.route('**/assets/Merge-*.js', (route) => (gone ? route.fulfill({ status: 404, body: 'Not found' }) : route.continue()))

  // Opening a part not loaded yet fails – and the app reloads, landing where it was headed.
  const reloaded = page.waitForEvent('load')
  await page.getByRole('button', { name: 'More', exact: true }).first().click()
  await page.getByRole('button', { name: 'Add or update products' }).click()
  await reloaded
  gone = false
  await expect(page.getByRole('heading', { name: 'Add or update products' })).toBeVisible()

  // Coming back to the app after an update reloads it before anything is tapped (once a minute
  // at most, so the guard of the reload above is cleared first).
  await page.evaluate(() => sessionStorage.clear())
  const again = page.waitForEvent('load')
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await again

  // Anything else that breaks shows a way out instead of a blank page.
  await context.unrouteAll()
  await page.evaluate(() => sessionStorage.clear())
  await context.route('**/assets/Merge-*.js', (route) => route.fulfill({ status: 404, body: 'Not found' }))
  await page.goto('/')
  await page.evaluate(async () => Promise.all((await caches.keys()).map((k) => caches.delete(k))))
  await page.evaluate(() => sessionStorage.setItem('propario-reloaded-at', String(Date.now())))
  await page.getByRole('link', { name: 'Kitchen cabinet' }).click()
  await page.getByRole('button', { name: 'More', exact: true }).first().click()
  await page.getByRole('button', { name: 'Add or update products' }).click()
  await expect(page.getByRole('heading', { name: 'Propario needs to be reloaded' })).toBeVisible()
  await expect(page.getByText(/reference [0-9a-f]{8}/)).toBeVisible()
  await accessible(page, 'crash screen')
  await context.unrouteAll()
  await page.getByRole('button', { name: 'Reload', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Add or update products' })).toBeVisible()
})

test('a start that hangs or fails says where, reports it, and resetting the browser helps', async () => {
  const page = await ada.context.newPage()
  // The server does not answer: after a while the page says which step hangs and reports it.
  await page.route('**/api/session', () => {})
  const reported = page.waitForRequest('**/api/client-error', { timeout: 20_000 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Propario is not starting' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('It stopped while checking the sign-in.')).toBeVisible()
  const request = await reported
  expect(request.postDataJSON()).toMatchObject({ kind: 'stuck', step: 'session' })
  expect((await request.response())?.status()).toBe(200)
  await page.getByText('Details for troubleshooting').click()
  await expect(page.getByText(/Reference: [0-9a-f]{8}/)).toBeVisible()
  await accessible(page, 'start stuck')

  // A failing server is shown as that, not as the sign-in page.
  await page.unrouteAll()
  await page.route('**/api/session', (route) => route.fulfill({ status: 500, json: { error: 'internal', ref: 'deadbeef' } }))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Propario could not start' })).toBeVisible()

  // Resetting this browser keeps the sign-in; the data comes back from the server.
  await page.unrouteAll()
  await page.getByRole('link', { name: 'Reset this browser' }).click()
  await expect(page.getByRole('heading', { name: 'Reset Propario in this browser' })).toBeVisible()
  await accessible(page, 'reset page')
  await page.getByRole('link', { name: 'Reset now' }).click()
  // The browser clears Propario's copy itself (Clear-Site-Data), and the page checks it did.
  await expect(page.getByRole('heading', { name: 'Done' })).toBeVisible()
  expect(await page.evaluate(async () => (await caches.keys()).length + (await navigator.serviceWorker.getRegistrations()).length)).toBe(0)
  await page.getByRole('link', { name: 'Open Propario' }).click()
  await expect(page.getByRole('link', { name: 'Kitchen cabinet' })).toBeVisible()
  await page.close()
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
