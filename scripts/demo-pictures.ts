/**
 * Draws the demo's product pictures (public/demo) – invented products, so no photo of anyone's
 * product is shipped: studio shots in vector, on white like the pictures shops show, with
 * materials (grain, lacquer, metal) in gradients, a three-quarter view and a soft floor shadow.
 * Further pictures are dimension drawings, as shops often have them.
 *
 *   node scripts/demo-pictures.ts
 *
 * Change a picture here and run it again; never edit the SVGs by hand.
 */
import { mkdirSync, writeFileSync } from 'node:fs'

const W = 640
const H = 480
const OUT = 'public/demo'

let uid = 0
/** Ids unique within one picture (each SVG is shown on its own, but stays tidy when inlined). */
const id = (name: string) => `${name}${++uid}`

const svg = (label: string, defs: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">` +
  `<defs>${defs}</defs><rect width="${W}" height="${H}" fill="#fff"/>${body}</svg>\n`

const lin = (gid: string, stops: [number, string, number?][], x2 = 0, y2 = 1) =>
  `<linearGradient id="${gid}" x1="0" y1="0" x2="${x2}" y2="${y2}">` +
  stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('') +
  `</linearGradient>`

const rad = (gid: string, stops: [number, string, number?][], cx = 0.5, cy = 0.5, r = 0.5) =>
  `<radialGradient id="${gid}" cx="${cx}" cy="${cy}" r="${r}">` +
  stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('') +
  `</radialGradient>`

/** A soft shadow on the floor under an object. */
function floorShadow(cx: number, cy: number, rx: number, ry: number) {
  const g = id('shadow')
  return {
    defs: rad(g, [
      [0, '#1b1f22', 0.28],
      [0.55, '#1b1f22', 0.12],
      [1, '#1b1f22', 0],
    ]),
    body: `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${g})"/>`,
  }
}

/** Mixes a hex colour with white (t > 0) or black (t < 0). */
function shade(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16)
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(t >= 0 ? c + (255 - c) * t : c * (1 + t)))
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

// ---------- sideboards ----------

interface Sideboard {
  file: string
  /** Outer size in cm, as in the demo's fields. */
  width: number
  height: number
  depth: number
  wood: string
  grain: boolean
  doors: number
  /** Drawers across the top, above the doors. */
  drawers?: boolean
  handle: 'knob' | 'bar' | 'groove'
  legs: 'tapered' | 'plinth' | 'hairpin'
  handleColor?: string
}

function sideboard(s: Sideboard): string {
  uid = 0
  const scale = 2.3
  const fw = s.width * scale
  const legH = s.legs === 'plinth' ? 10 : s.legs === 'hairpin' ? 34 : 26
  const bodyH = s.height * scale - legH
  const dx = s.depth * 1.35
  const dy = s.depth * 0.82
  const total = fw + dx
  const x = (W - total) / 2
  const groundY = 405
  const y = groundY - legH - bodyH
  const front = id('front')
  const side = id('side')
  const top = id('top')
  const metal = id('metal')
  const clip = id('clip')
  const shadow = floorShadow(x + total / 2 + 10, groundY + 6, total * 0.62, 22)
  const defs =
    lin(front, [
      [0, shade(s.wood, 0.1)],
      [0.55, s.wood],
      [1, shade(s.wood, -0.12)],
    ]) +
    lin(side, [
      [0, shade(s.wood, -0.18)],
      [1, shade(s.wood, -0.32)],
    ]) +
    lin(
      top,
      [
        [0, shade(s.wood, 0.28)],
        [1, shade(s.wood, 0.12)],
      ],
      1,
      0,
    ) +
    lin(
      metal,
      [
        [0, shade(s.handleColor ?? '#9aa0a3', 0.45)],
        [0.5, s.handleColor ?? '#9aa0a3'],
        [1, shade(s.handleColor ?? '#9aa0a3', -0.35)],
      ],
      1,
      0,
    ) +
    `<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${fw}" height="${bodyH}"/></clipPath>` +
    shadow.defs
  const parts: string[] = [shadow.body]
  const edge = shade(s.wood, -0.38)

  // Legs behind the body first (the back right one), then the body, then the front legs.
  const leg = (lx: number, back = false) => {
    if (s.legs === 'tapered') return `<path d="M${lx - 6} ${groundY - legH} h12 l-3 ${legH} h-6 z" fill="${shade(s.wood, back ? -0.45 : -0.3)}"/>`
    if (s.legs === 'hairpin')
      return `<path d="M${lx - 7} ${groundY - legH} L${lx - 2} ${groundY} M${lx + 7} ${groundY - legH} L${lx + 2} ${groundY}" stroke="${back ? '#3b3f42' : '#25292c'}" stroke-width="3" stroke-linecap="round" fill="none"/>`
    return ''
  }
  if (s.legs !== 'plinth') parts.push(leg(x + fw + dx - 18, true))
  if (s.legs === 'plinth') parts.push(`<rect x="${x + 10}" y="${groundY - legH}" width="${fw - 20}" height="${legH}" fill="${shade(s.wood, -0.5)}"/>`)

  // Body: right side, top, front.
  parts.push(
    `<path d="M${x + fw} ${y} L${x + fw + dx} ${y - dy} L${x + fw + dx} ${y - dy + bodyH} L${x + fw} ${y + bodyH} Z" fill="url(#${side})" stroke="${edge}" stroke-width="1.2" stroke-linejoin="round"/>`,
    `<path d="M${x} ${y} L${x + dx} ${y - dy} L${x + fw + dx} ${y - dy} L${x + fw} ${y} Z" fill="url(#${top})" stroke="${edge}" stroke-width="1.2" stroke-linejoin="round"/>`,
    `<rect x="${x}" y="${y}" width="${fw}" height="${bodyH}" fill="url(#${front})" stroke="${edge}" stroke-width="1.2"/>`,
  )
  // Grain: a few long, slightly wavy lines across the front.
  if (s.grain) {
    const lines: string[] = []
    for (let i = 0; i < 9; i++) {
      const gy = y + 10 + (i * (bodyH - 20)) / 8
      const a = 2 + (i % 3)
      lines.push(
        `<path d="M${x} ${gy} C${x + fw * 0.25} ${gy - a} ${x + fw * 0.5} ${gy + a} ${x + fw * 0.75} ${gy - a / 2} S${x + fw} ${gy + a / 2} ${x + fw} ${gy}" stroke="${shade(s.wood, -0.3)}" stroke-width="1" fill="none" opacity="0.18"/>`,
      )
    }
    parts.push(`<g clip-path="url(#${clip})">${lines.join('')}</g>`)
  }
  // A bright edge where the top meets the front.
  parts.push(`<path d="M${x + 1} ${y + 1} H${x + fw - 1}" stroke="#fff" stroke-width="1.4" opacity="0.55"/>`)

  // Fronts: optional drawer row, then doors.
  const inset = 8
  const drawerH = s.drawers ? bodyH * 0.28 : 0
  const doorTop = y + inset + (s.drawers ? drawerH : 0)
  const doorH = bodyH - inset * 2 - (s.drawers ? drawerH : 0)
  const doorW = (fw - inset * 2) / s.doors
  const gap = (gx: number, gy: number, gw: number, gh: number) =>
    `<rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="1.5" fill="none" stroke="${shade(s.wood, -0.42)}" stroke-width="1.4" opacity="0.85"/>` +
    `<path d="M${gx + 1.5} ${gy + gh - 1} H${gx + gw - 1.5}" stroke="#fff" stroke-width="1" opacity="0.35"/>`
  const handle = (hx: number, hy: number, vertical: boolean) => {
    if (s.handle === 'knob')
      return `<circle cx="${hx}" cy="${hy}" r="5" fill="url(#${metal})" stroke="${shade(s.handleColor ?? '#9aa0a3', -0.45)}" stroke-width="0.8"/>`
    if (s.handle === 'bar')
      return vertical
        ? `<rect x="${hx - 2.5}" y="${hy - 22}" width="5" height="44" rx="2.5" fill="url(#${metal})"/>`
        : `<rect x="${hx - 22}" y="${hy - 2.5}" width="44" height="5" rx="2.5" fill="url(#${metal})"/>`
    return ''
  }
  if (s.drawers) {
    const dw = (fw - inset * 2) / 2
    for (let i = 0; i < 2; i++) {
      const gx = x + inset + i * dw + 2
      parts.push(gap(gx, y + inset, dw - 4, drawerH - 6), handle(gx + dw / 2 - 2, y + inset + (drawerH - 6) / 2, false))
    }
  }
  for (let i = 0; i < s.doors; i++) {
    const gx = x + inset + i * doorW + 2
    parts.push(gap(gx, doorTop, doorW - 4, doorH))
    // Handles towards the middle of each pair of doors.
    const right = i % 2 === 0 && i < s.doors - 1
    parts.push(handle(right ? gx + doorW - 16 : gx + 12, doorTop + doorH / 2, true))
  }
  if (s.handle === 'groove')
    parts.push(`<rect x="${x + inset}" y="${doorTop - 6}" width="${fw - inset * 2}" height="5" fill="${shade(s.wood, -0.5)}" opacity="0.7"/>`)

  if (s.legs !== 'plinth') parts.push(leg(x + 18), leg(x + fw - 18))
  return svg(s.file, defs, parts.join(''))
}

/** A front view with its measures – the drawing that helps most when it has to fit a niche. */
function dimensionDrawing(label: string, shape: string, measures: { w: string; h: string; d?: string }, box: { x: number; y: number; w: number; h: number }) {
  uid = 0
  const ink = '#2c3336'
  const arrow = id('arrow')
  const defs = `<marker id="${arrow}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 z" fill="${ink}"/></marker>`
  const text = (tx: number, ty: number, t: string, rotate = false) =>
    `<text x="${tx}" y="${ty}" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="600" fill="${ink}" text-anchor="middle"${rotate ? ` transform="rotate(-90 ${tx} ${ty})"` : ''}>${t}</text>`
  const { x, y, w, h } = box
  const body =
    shape +
    // Width above, height on the left, depth note below.
    `<path d="M${x} ${y - 28} H${x + w}" stroke="${ink}" stroke-width="1.6" marker-start="url(#${arrow})" marker-end="url(#${arrow})"/>` +
    `<path d="M${x} ${y - 38} V${y - 8} M${x + w} ${y - 38} V${y - 8}" stroke="${ink}" stroke-width="1" opacity="0.5"/>` +
    text(x + w / 2, y - 38, measures.w) +
    `<path d="M${x - 28} ${y} V${y + h}" stroke="${ink}" stroke-width="1.6" marker-start="url(#${arrow})" marker-end="url(#${arrow})"/>` +
    `<path d="M${x - 38} ${y} H${x - 8} M${x - 38} ${y + h} H${x - 8}" stroke="${ink}" stroke-width="1" opacity="0.5"/>` +
    text(x - 40, y + h / 2, measures.h, true) +
    (measures.d ? text(x + w / 2, y + h + 44, measures.d) : '')
  return svg(label, defs, body)
}

// ---------- headphones ----------

interface Headphones {
  file: string
  shell: string
  cushion: string
  band: string
  accent: string
  /** Rounder, smaller cups for a lighter model. */
  compact?: boolean
}

function headphones(p: Headphones): string {
  uid = 0
  const cx = W / 2
  const cupRx = p.compact ? 66 : 74
  const cupRy = p.compact ? 84 : 96
  const span = p.compact ? 150 : 160
  const cupY = 270
  const shell = id('shell')
  const band = id('band')
  const cushion = id('cushion')
  const metal = id('metal')
  const shine = id('shine')
  const shadow = floorShadow(cx, 420, 230, 24)
  const defs =
    rad(
      shell,
      [
        [0, shade(p.shell, 0.28)],
        [0.6, p.shell],
        [1, shade(p.shell, -0.3)],
      ],
      0.38,
      0.32,
      0.75,
    ) +
    lin(band, [
      [0, shade(p.band, 0.25)],
      [1, shade(p.band, -0.25)],
    ]) +
    lin(
      cushion,
      [
        [0, shade(p.cushion, -0.15)],
        [0.5, p.cushion],
        [1, shade(p.cushion, -0.35)],
      ],
      1,
      0,
    ) +
    lin(
      metal,
      [
        [0, '#e9ecee'],
        [0.5, '#a9b0b4'],
        [1, '#6c7377'],
      ],
      1,
      0,
    ) +
    lin(shine, [
      [0, '#fff', 0.55],
      [1, '#fff', 0],
    ]) +
    shadow.defs
  const parts: string[] = [shadow.body]
  // Headband: an outer arch and a softer inner pad.
  const top = 92
  parts.push(
    `<path d="M${cx - span} ${cupY - cupRy + 30} C${cx - span} ${top - 40} ${cx + span} ${top - 40} ${cx + span} ${cupY - cupRy + 30}" stroke="url(#${band})" stroke-width="22" fill="none" stroke-linecap="round"/>`,
    `<path d="M${cx - span + 26} ${cupY - cupRy + 24} C${cx - span + 30} ${top - 6} ${cx + span - 30} ${top - 6} ${cx + span - 26} ${cupY - cupRy + 24}" stroke="${shade(p.band, -0.35)}" stroke-width="14" fill="none" stroke-linecap="round"/>`,
    `<path d="M${cx - 60} ${top - 13} C${cx - 20} ${top - 21} ${cx + 20} ${top - 21} ${cx + 60} ${top - 13}" stroke="#fff" stroke-width="3" fill="none" opacity="0.35" stroke-linecap="round"/>`,
  )
  for (const dir of [-1, 1]) {
    const x = cx + dir * span
    // Slider and yoke in metal.
    parts.push(
      `<rect x="${x - 6}" y="${cupY - cupRy - 18}" width="12" height="52" rx="4" fill="url(#${metal})"/>`,
      `<path d="M${x - dir * 4 - cupRx * 0.55} ${cupY - cupRy + 30} C${x - cupRx * 0.6} ${cupY - cupRy - 4} ${x + cupRx * 0.6} ${cupY - cupRy - 4} ${x + dir * 4 + cupRx * 0.55} ${cupY - cupRy + 30}" stroke="url(#${metal})" stroke-width="7" fill="none" stroke-linecap="round"/>`,
    )
    // Cushion (seen at the edge), shell, rim light and the mark.
    parts.push(
      `<ellipse cx="${x - dir * 14}" cy="${cupY}" rx="${cupRx}" ry="${cupRy}" fill="url(#${cushion})"/>`,
      `<ellipse cx="${x}" cy="${cupY}" rx="${cupRx}" ry="${cupRy}" fill="url(#${shell})" stroke="${shade(p.shell, -0.4)}" stroke-width="1.2"/>`,
      `<ellipse cx="${x}" cy="${cupY}" rx="${cupRx - 14}" ry="${cupRy - 16}" fill="none" stroke="${shade(p.shell, 0.18)}" stroke-width="1.5" opacity="0.7"/>`,
      `<ellipse cx="${x - cupRx * 0.25}" cy="${cupY - cupRy * 0.45}" rx="${cupRx * 0.45}" ry="${cupRy * 0.28}" fill="url(#${shine})" opacity="0.6"/>`,
      `<circle cx="${x}" cy="${cupY + 4}" r="7" fill="${p.accent}"/>`,
    )
  }
  return svg(p.file, defs, parts.join(''))
}

// ---------- robot vacuums ----------

interface Vacuum {
  file: string
  body: string
  top: string
  /** Laser tower on top (most), or a flat top with a front camera. */
  tower: boolean
  accent: string
  /** Height in cm, for the side drawing. */
  height: number
}

function vacuum(v: Vacuum): string {
  uid = 0
  const cx = W / 2
  const cy = 210
  const rx = 215
  const ry = 92
  const wall = v.height * 5.2
  const topG = id('top')
  const wallG = id('wall')
  const glass = id('glass')
  const shine = id('shine')
  const shadow = floorShadow(cx, cy + wall + 66, rx * 1.02, 34)
  const defs =
    rad(
      topG,
      [
        [0, shade(v.top, 0.35)],
        [0.55, v.top],
        [1, shade(v.top, -0.18)],
      ],
      0.42,
      0.3,
      0.8,
    ) +
    lin(
      wallG,
      [
        [0, shade(v.body, -0.35)],
        [0.35, shade(v.body, 0.05)],
        [0.65, v.body],
        [1, shade(v.body, -0.4)],
      ],
      1,
      0,
    ) +
    lin(glass, [
      [0, '#3a4448'],
      [1, '#0d1113'],
    ]) +
    lin(shine, [
      [0, '#fff', 0.6],
      [1, '#fff', 0],
    ]) +
    shadow.defs
  const parts: string[] = [shadow.body]
  // Side wall: the lower half of the ellipse, moved down by the height.
  parts.push(
    `<path d="M${cx - rx} ${cy} A${rx} ${ry} 0 0 0 ${cx + rx} ${cy} V${cy + wall} A${rx} ${ry} 0 0 1 ${cx - rx} ${cy + wall} Z" fill="url(#${wallG})"/>`,
    // Bumper seam around the front half.
    `<path d="M${cx - rx + 4} ${cy + wall * 0.45} A${rx - 2} ${ry} 0 0 0 ${cx + rx - 4} ${cy + wall * 0.45}" stroke="${shade(v.body, -0.5)}" stroke-width="1.6" fill="none" opacity="0.8"/>`,
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${topG})" stroke="${shade(v.top, -0.3)}" stroke-width="1.2"/>`,
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx - 22}" ry="${ry - 12}" fill="none" stroke="${shade(v.top, -0.12)}" stroke-width="1.2" opacity="0.8"/>`,
  )
  if (v.tower) {
    const ty = cy - 30
    parts.push(
      `<path d="M${cx - 46} ${ty} V${ty + 18} A46 18 0 0 0 ${cx + 46} ${ty + 18} V${ty} Z" fill="${shade(v.body, -0.25)}"/>`,
      `<ellipse cx="${cx}" cy="${ty}" rx="46" ry="18" fill="${shade(v.top, 0.1)}" stroke="${shade(v.top, -0.35)}" stroke-width="1"/>`,
      `<path d="M${cx - 46} ${ty + 9} A46 18 0 0 0 ${cx + 46} ${ty + 9}" stroke="url(#${glass})" stroke-width="7" fill="none"/>`,
    )
  } else {
    parts.push(
      `<path d="M${cx - 70} ${cy + ry - 6} A${rx} ${ry} 0 0 0 ${cx + 70} ${cy + ry - 6} L${cx + 64} ${cy + ry + 8} A${rx} ${ry} 0 0 1 ${cx - 64} ${cy + ry + 8} Z" fill="url(#${glass})"/>`,
    )
  }
  // Buttons and the gloss across the top.
  parts.push(
    `<ellipse cx="${cx}" cy="${cy + 42}" rx="20" ry="8" fill="${shade(v.top, -0.08)}" stroke="${shade(v.top, -0.3)}" stroke-width="1"/>`,
    `<ellipse cx="${cx}" cy="${cy + 42}" rx="7" ry="3" fill="${v.accent}"/>`,
    `<ellipse cx="${cx - 70}" cy="${cy - 40}" rx="120" ry="34" fill="url(#${shine})" opacity="0.55"/>`,
  )
  return svg(v.file, defs, parts.join(''))
}

// ---------- the demo's products ----------

const sideboards: Sideboard[] = [
  {
    file: 'sideboard-arvika',
    width: 160,
    height: 80,
    depth: 42,
    wood: '#c99a64',
    grain: true,
    doors: 3,
    handle: 'knob',
    legs: 'tapered',
    handleColor: '#3d3a36',
  },
  { file: 'sideboard-bo', width: 180, height: 75, depth: 45, wood: '#7a5034', grain: true, doors: 4, handle: 'bar', legs: 'hairpin', handleColor: '#b7974f' },
  { file: 'sideboard-kanto', width: 150, height: 85, depth: 40, wood: '#eceae4', grain: false, doors: 2, handle: 'groove', legs: 'plinth' },
  {
    file: 'sideboard-mira',
    width: 200,
    height: 78,
    depth: 40,
    wood: '#dcb98a',
    grain: true,
    doors: 4,
    drawers: true,
    handle: 'knob',
    legs: 'tapered',
    handleColor: '#4a4540',
  },
  {
    file: 'sideboard-arvika-low',
    width: 180,
    height: 60,
    depth: 42,
    wood: '#c99a64',
    grain: true,
    doors: 3,
    handle: 'knob',
    legs: 'tapered',
    handleColor: '#3d3a36',
  },
  {
    file: 'sideboard-linea',
    width: 170,
    height: 72,
    depth: 38,
    wood: '#b98a5c',
    grain: true,
    doors: 2,
    drawers: true,
    handle: 'bar',
    legs: 'hairpin',
    handleColor: '#2e3134',
  },
]

const headphoneModels: Headphones[] = [
  { file: 'headphones-aura', shell: '#2b2f33', cushion: '#1d2023', band: '#33373b', accent: '#c9a45c' },
  { file: 'headphones-kestrel', shell: '#e7e3dc', cushion: '#cfc9bf', band: '#d9d4cb', accent: '#8f8a82' },
  { file: 'headphones-ondo', shell: '#3f4a3d', cushion: '#2a3129', band: '#2f362e', accent: '#d8c49a' },
  { file: 'headphones-lumen', shell: '#5d7fa6', cushion: '#3b516b', band: '#4b6787', accent: '#e8eef5', compact: true },
  { file: 'headphones-halden', shell: '#8a8f93', cushion: '#4d5256', band: '#5f6468', accent: '#1f2326' },
]

const vacuums: Vacuum[] = [
  { file: 'vacuum-tidy', body: '#2d3134', top: '#3a3f43', tower: true, accent: '#3fb6c0', height: 9.2 },
  { file: 'vacuum-robin', body: '#d9dcdd', top: '#f3f4f4', tower: true, accent: '#3d8bd6', height: 9.6 },
  { file: 'vacuum-nimbus', body: '#1f2224', top: '#2b2f32', tower: false, accent: '#e0a63c', height: 8.1 },
  { file: 'vacuum-pebble', body: '#c8ccce', top: '#e6e8e9', tower: false, accent: '#6bbf73', height: 7.8 },
  { file: 'vacuum-orbit', body: '#5b6063', top: '#71777a', tower: true, accent: '#e05a4f', height: 10.3 },
]

mkdirSync(OUT, { recursive: true })
const write = (name: string, content: string) => writeFileSync(`${OUT}/${name}.svg`, content)
for (const s of sideboards) write(s.file, sideboard(s))
for (const p of headphoneModels) write(p.file, headphones(p))
for (const v of vacuums) write(v.file, vacuum(v))

// Dimension drawings: the sideboard's front, and a vacuum from the side (does it fit under the sofa?).
const ink = '#2c3336'
write(
  'sideboard-arvika-dims',
  dimensionDrawing(
    'sideboard-arvika-dims',
    `<rect x="150" y="150" width="340" height="150" fill="none" stroke="${ink}" stroke-width="2.5"/>` +
      `<path d="M263 162 V288 M377 162 V288" stroke="${ink}" stroke-width="1.5"/>` +
      `<rect x="162" y="162" width="316" height="126" fill="none" stroke="${ink}" stroke-width="1.2" opacity="0.6"/>` +
      `<path d="M168 300 l4 40 h8 l4 -40 M456 300 l4 40 h8 l4 -40" fill="none" stroke="${ink}" stroke-width="2"/>`,
    { w: '160 cm', h: '80 cm' },
    { x: 150, y: 150, w: 340, h: 190 },
  ),
)
write(
  'vacuum-tidy-dims',
  dimensionDrawing(
    'vacuum-tidy-dims',
    `<rect x="140" y="250" width="360" height="62" rx="18" fill="none" stroke="${ink}" stroke-width="2.5"/>` +
      `<rect x="285" y="226" width="70" height="24" rx="6" fill="none" stroke="${ink}" stroke-width="2"/>` +
      `<path d="M150 330 H490" stroke="${ink}" stroke-width="1" opacity="0.4"/>`,
    { w: '35 cm', h: '9,2 cm' },
    { x: 140, y: 226, w: 360, h: 104 },
  ),
)
console.log(`Demo pictures written to ${OUT}`)
