/**
 * Which of a shop page's pictures to keep as the second one (see src/images.ts): a dimension
 * drawing – named so in its address ("…/masszeichnung.jpg", "…-dimensions.png") or recognised by
 * its pixels – otherwise the next picture of the gallery. Never the main picture again, also not
 * in another size of the same file.
 */
const DIMENSION =
  /(?:^|[/_\-.])(?:masse|maße|mass|masszeichnung|massskizze|abmessungen?|dimensions?|zeichnung|skizze|technical|measures?|measurements?)(?:[/_\-.]|$)/i

const fileOf = (u: string) => {
  try {
    const url = new URL(u)
    return `${url.hostname}${url.pathname}`.toLowerCase()
  } catch {
    return u.toLowerCase()
  }
}

/** The page's pictures besides the main one (each file once), and one whose address names it a dimension drawing. */
export function furtherCandidates(gallery: string[], main: string): { named: string | null; others: string[] } {
  const seen = new Set([fileOf(main)])
  const others = gallery.filter((c) => !seen.has(fileOf(c)) && seen.add(fileOf(c)))
  const pathOf = (u: string) => {
    try {
      return decodeURIComponent(new URL(u).pathname)
    } catch {
      return u
    }
  }
  return { named: others.find((c) => DIMENSION.test(pathOf(c))) ?? null, others }
}

export interface PixelStats {
  /** Near-white, uncoloured pixels. */
  white: number
  /** Clearly coloured pixels (wood, fabric, paint). */
  colorful: number
  /** Dark pixels: lines, figures, text. */
  ink: number
  /** Mid greys: shading and shadows of a photographed object. */
  shading: number
}

/** Shares (0 … 1) of the kinds of pixels in RGBA data. */
export function pixelStats(rgba: Uint8ClampedArray): PixelStats {
  let white = 0
  let colorful = 0
  let ink = 0
  let shading = 0
  let n = 0
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue // transparent: background
    const r = rgba[i]
    const g = rgba[i + 1]
    const b = rgba[i + 2]
    const luma = 0.299 * r + 0.587 * g + 0.114 * b
    const chroma = Math.max(r, g, b) - Math.min(r, g, b)
    n++
    if (chroma > 45) colorful++
    else if (luma > 235) white++
    else if (luma < 140) ink++
    else shading++
  }
  return n ? { white: white / n, colorful: colorful / n, ink: ink / n, shading: shading / n } : { white: 1, colorful: 0, ink: 0, shading: 0 }
}

/**
 * A dimension drawing, without AI: mostly white, dark thin lines and figures, at most a little
 * colour (dimension lines are often blue or red) and almost no grey shading – which tells it
 * from a cabinet photographed on white. A guess: when unsure it says no, and the next picture of
 * the gallery is kept instead. Tuned on real shop pictures (tests/page-import.test.ts).
 */
export function looksLikeDrawing(s: PixelStats): boolean {
  return s.white >= 0.8 && s.colorful < 0.06 && s.ink >= 0.004 && s.ink <= 0.15 && s.shading < 0.05
}
