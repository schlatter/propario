import { spawn, type ChildProcess } from 'node:child_process'
import { expect, test } from '@playwright/test'

/**
 * The website's demo (npm run build:demo): plain files under /propario/demo/ on GitHub Pages, no
 * server behind them. It must start straight into the invented comparisons, keep its routes after
 * the #, and never ask for anything outside its own folder.
 */
const origin = 'http://localhost:4174'
const url = `${origin}/propario/demo/`
let preview: ChildProcess

test.beforeAll(async () => {
  preview = spawn('node_modules/.bin/vite', ['preview', '--outDir', 'dist-demo', '--base', '/propario/demo/', '--port', '4174', '--strictPort'], {
    stdio: 'ignore',
  })
  await expect.poll(async () => (await fetch(url).catch(() => null))?.ok ?? false, { timeout: 30_000 }).toBe(true)
})

test.afterAll(() => {
  preview.kill()
})

test('the website’s demo runs from plain files and never asks a server', async ({ page }) => {
  const outside: string[] = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.origin !== origin || !u.pathname.startsWith('/propario/demo/')) outside.push(r.url())
  })

  await page.goto(url)
  await expect(page.getByRole('status').filter({ hasText: 'Demo – invented data, nothing is saved.' })).toBeVisible()
  await page.getByRole('link', { name: /Living-room sideboard/ }).click()
  await expect(page).toHaveURL(/#\/p\//)
  const picture = page.locator('table.grid tbody img').first()
  await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)

  // A change shows at once …
  const arvika = page.locator('table.grid tbody tr', { hasText: 'Arvika' }).first()
  await page.getByRole('button', { name: 'Arvika', exact: true }).click()
  await page.getByRole('textbox', { name: 'Price', exact: true }).fill('799')
  await page.getByRole('textbox', { name: 'Price', exact: true }).press('Tab')
  await page.locator('dialog.drawer').getByRole('button', { name: 'Close', exact: true }).click()
  await expect(arvika).toContainText('€799')
  // … a reload keeps the route, which lives after the # …
  await page.reload()
  await expect(arvika).toContainText('€799')
  // … and "Start over" brings back the invented comparisons.
  await page.getByRole('button', { name: 'Start over' }).click()
  await page.getByRole('link', { name: /Living-room sideboard/ }).click()
  await expect(arvika).toContainText('€849')

  expect(outside).toEqual([])
})
