/**
 * Draws Propario's mark – a P whose bowl is a magnifying glass, its handle set apart in amber –
 * and writes every icon from that one drawing: the favicon (also shown in the app's top bar),
 * the PWA icons (any, maskable, monochrome) and the Apple touch icon.
 *
 *   node scripts/icons.ts
 *
 * Renders the PNGs with Playwright's Chromium, which the e2e tests install anyway.
 */
import { writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const PETROL = '#1f7a80'
const WHITE = '#ffffff'
const AMBER = '#f2b33d'

/**
 * The mark on a 32 × 32 grid: stem and ring of the P, then the handle with a clear gap to the
 * ring (its round end stays 1 unit off the ring's edge), all shifted to sit in the middle.
 */
const glyph = (p: string, handle: string) =>
  `<g transform="translate(-2.3 -0.4)">` +
  `<path d="M10.5 26V7" stroke="${p}" stroke-width="3.6" stroke-linecap="round"/>` +
  `<circle cx="16.8" cy="13.2" r="6.2" fill="none" stroke="${p}" stroke-width="3.6"/>` +
  `<path d="M24.4 20.8l3 3" stroke="${handle}" stroke-width="3.6" stroke-linecap="round"/>` +
  `</g>`

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`
/** Scaled about the centre – for icons whose edges a launcher may cut off. */
const inner = (scale: number, body: string) => `<g transform="translate(${16 - 16 * scale} ${16 - 16 * scale}) scale(${scale})">${body}</g>`

const tile = svg(`<rect width="32" height="32" rx="7" fill="${PETROL}"/>${glyph(WHITE, AMBER)}`)
const icons: { file: string; size: number; svg: string; transparent: boolean }[] = [
  { file: 'icon-192.png', size: 192, svg: tile, transparent: true },
  { file: 'icon-512.png', size: 512, svg: tile, transparent: true },
  // Android masks to a circle or other shape; the mark stays inside the safe zone (80 %).
  {
    file: 'icon-maskable-512.png',
    size: 512,
    svg: svg(`<rect width="32" height="32" fill="${PETROL}"/>${inner(0.74, glyph(WHITE, AMBER))}`),
    transparent: false,
  },
  // Themed icons use only the shape; the system colours it.
  { file: 'icon-monochrome-512.png', size: 512, svg: svg(inner(0.74, glyph(WHITE, WHITE))), transparent: true },
  // iOS rounds the corners itself.
  { file: 'apple-touch-icon.png', size: 180, svg: svg(`<rect width="32" height="32" fill="${PETROL}"/>${glyph(WHITE, AMBER)}`), transparent: false },
]

writeFileSync('public/favicon.svg', tile + '\n')
const browser = await chromium.launch()
const page = await browser.newPage()
for (const icon of icons) {
  await page.setViewportSize({ width: icon.size, height: icon.size })
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${icon.svg}`)
  await page.screenshot({ path: `public/${icon.file}`, omitBackground: icon.transparent })
}
await browser.close()
console.log(`favicon.svg and ${icons.length} PNG icons written to public/`)
