/**
 * Draws the README's pictures – the four promises under the title, the six steps of "How it
 * works" (wide and narrow) and the demo link – light and dark, into docs/images/readme/.
 *
 *   node scripts/readme-art.ts
 *
 * Change them here, never in the SVGs. The symbols are our own drawings on a 24 grid with stroke 2
 * and round ends – never copied from an icon set, which would need its license notice. Fuller than
 * the app's glyphs (src/ui/Glyph.tsx), which suits a README; the app keeps its own (docs/brand.md). The steps' words are the start page's
 * (src/i18n/en.ts, overview.s1Title … s6Title); tests/docs-consistency.test.ts keeps them in step.
 */
import { mkdirSync, writeFileSync } from 'node:fs'

const DIR = 'docs/images/readme'
const FONT = "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
const THEMES = {
  light: { ink: '#1f2328', petrol: '#1f7a80', tile: '#1f7a801f', arrow: '#8a9597' },
  dark: { ink: '#e6edf3', petrol: '#5cbcc1', tile: '#5cbcc126', arrow: '#6e7a7c' },
}
const AMBER = '#f2b33d'
const AMBER_INK = '#1d1503'
type Theme = (typeof THEMES)['light']

/** Symbols on a 24 grid, stroke 2, round. */
const SYMBOLS: Record<string, string> = {
  server:
    'M4 3h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM4 13h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2zM6 7h.01M6 17h.01',
  shield: 'M12 2.5l7.5 3v6c0 4.6-3.2 8.4-7.5 10-4.3-1.6-7.5-5.4-7.5-10v-6zM8.5 12l2.5 2.5 4.5-5',
  // Passkeys: a fingerprint – ridges around one core.
  fingerprint: 'M12 13.5V21M9 20.5V14a3 3 0 0 1 6 0v3.5M6 18.5V14a6 6 0 0 1 12 0v4.5M3.5 13a8.5 8.5 0 0 1 17 0M7 5.5a9.5 9.5 0 0 1 10 0',
  // Free software: a heart with two hands meeting in it.
  heartHands:
    'M12 20.5s-8.5-4.8-8.5-10.6A4.6 4.6 0 0 1 12 7.3a4.6 4.6 0 0 1 8.5 2.6c0 5.8-8.5 10.6-8.5 10.6zM7.5 13.5l2.8-2.4 2 1.4 1.9-1.6 2.3 2.1M10.3 11.1l1.7-1.4',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7',
  checks: 'M3 6l2 2 3.5-3.5M3 13l2 2 3.5-3.5M12 7h9M12 14h9M3 20h18',
  columns: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 3v18M15 3v18',
  thumbs: 'M7 10v11M3 10h4v11H3zM7 10l4-7c1.4 0 2.5 1.1 2.5 2.5V9h5.2a2 2 0 0 1 2 2.3l-1.2 7a2 2 0 0 1-2 1.7H7',
  scale: 'M12 3v18M7 21h10M5 7h14M2 15l3-8 3 8a3 3 0 0 1-6 0zM16 15l3-8 3 8a3 3 0 0 1-6 0z',
  people: 'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8',
}

const symbol = (name: string, x: number, y: number, size: number, color: string) =>
  `<g transform="translate(${x} ${y}) scale(${size / 24})" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${SYMBOLS[name]}"/></g>`

/** Text is fitted into an estimated width, so another system font cannot make it overflow. */
const fit = (s: string, size: number, weight: number) => Math.round(s.length * size * (weight >= 600 ? 0.58 : 0.54))
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const text = (s: string, x: number, y: number, size: number, weight: number, color: string, anchor = 'start') =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}" textLength="${fit(s, size, weight)}" lengthAdjust="spacingAndGlyphs">${esc(s)}</text>`

const svg = (w: number, h: number, label: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">\n` +
  `  <title>${esc(label)}</title>\n  ${body}\n</svg>\n`

// ---------- the four promises: one picture each, so a line breaks between them, never inside ----------

const PROMISES: [string, string, string][] = [
  ['self-hosted', 'server', 'Self-hosted'],
  ['private', 'shield', 'Private by default'],
  ['passkeys', 'fingerprint', 'Passkeys'],
  ['free-software', 'heartHands', 'Free software'],
]

function promise(icon: string, label: string, t: Theme) {
  const w = 30 + fit(label, 15, 500) + 4
  return svg(w, 24, label, symbol(icon, 0, 1, 22, t.petrol) + text(label, 30, 17.5, 15, 500, t.ink))
}

// ---------- how it works ----------

const STEPS: [string, string, string][] = [
  ['link', 'One link', 'is enough'],
  ['checks', 'Define your', 'requirements'],
  ['columns', 'Side by side, not', 'all over the place'],
  ['thumbs', 'Sort out', 'quickly'],
  ['scale', 'Settle it', 'in duels'],
  ['people', 'Decide', 'together'],
]
const STEPS_LABEL =
  'How you decide with Propario: 1 One link is enough, 2 Define your requirements, 3 Side by side, not all over the place, 4 Sort out quickly, 5 Settle it in duels, 6 Decide together.'

function step(i: number, cx: number, y: number, t: Theme) {
  const [icon, a, b] = STEPS[i]
  return (
    `<rect x="${cx - 28}" y="${y + 6}" width="56" height="56" rx="16" fill="${t.tile}"/>` +
    symbol(icon, cx - 14, y + 20, 28, t.petrol) +
    `<circle cx="${cx + 26}" cy="${y + 8}" r="10" fill="${AMBER}"/>` +
    `<text x="${cx + 26}" y="${y + 12.5}" font-family="${FONT}" font-size="12" font-weight="700" fill="${AMBER_INK}" text-anchor="middle">${i + 1}</text>` +
    text(a, cx, y + 84, 13.5, 600, t.ink, 'middle') +
    text(b, cx, y + 102, 13.5, 600, t.ink, 'middle')
  )
}
const arrow = (x: number, y: number, t: Theme) =>
  `<path d="M${x - 9} ${y}h18m-5-5l5 5-5 5" fill="none" stroke="${t.arrow}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`

function steps(columns: number, colWidth: number, t: Theme) {
  const rows = Math.ceil(STEPS.length / columns)
  const rowHeight = 120
  let body = ''
  STEPS.forEach((_, i) => {
    const row = Math.floor(i / columns)
    const col = i % columns
    const cx = col * colWidth + colWidth / 2
    body += step(i, cx, row * rowHeight, t)
    if (col < columns - 1 && i < STEPS.length - 1) body += arrow(cx + colWidth / 2, row * rowHeight + 34, t)
  })
  return svg(columns * colWidth, rows * rowHeight - 8, STEPS_LABEL, body)
}

// ---------- the demo: a quiet pill leading the row of links ----------

function demoPill(t: Theme) {
  const label = 'Try the demo'
  const w = 34 + fit(label, 14, 600) + 16
  return svg(
    w,
    30,
    'Try the demo – right in your browser',
    `<rect x="0.5" y="0.5" width="${w - 1}" height="29" rx="14.5" fill="${t.tile}" stroke="${t.petrol}" stroke-opacity="0.45"/>` +
      `<path d="M14 10v10l8.5-5z" fill="${t.petrol}" stroke="${t.petrol}" stroke-width="1.5" stroke-linejoin="round"/>` +
      text(label, 32, 19.5, 14, 600, t.petrol),
  )
}

mkdirSync(DIR, { recursive: true })
for (const [name, t] of Object.entries(THEMES)) {
  for (const [file, icon, label] of PROMISES) writeFileSync(`${DIR}/${file}-${name}.svg`, promise(icon, label, t))
  writeFileSync(`${DIR}/how-it-works-${name}.svg`, steps(6, 148, t))
  writeFileSync(`${DIR}/how-it-works-narrow-${name}.svg`, steps(3, 150, t))
  writeFileSync(`${DIR}/demo-${name}.svg`, demoPill(t))
}
console.log(`Written to ${DIR}/`)
