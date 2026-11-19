/**
 * Tables written as text, as an AI answers or a spreadsheet saves them: a Markdown table (also in
 * the middle of prose), CSV/TSV with comma, semicolon or tab, or JSON (a list of objects). Each
 * becomes the same grid an Excel sheet becomes, so the column mapping in ./excel.ts reads them
 * all. Pure and dependency-free.
 */
import type { Cell, Grid } from './excel'

const MAX_CHARS = 2_000_000
const MAX_ROWS = 2000

/** Every table found in the text, in order; empty when there is none. */
export function textToGrids(text: string): Grid[] {
  const src = text.replace(/^﻿/, '').slice(0, MAX_CHARS)
  if (!src.trim()) return []
  const json = jsonGrid(src)
  if (json) return [json]
  const md = markdownGrids(src)
  if (md.length) return md
  const csv = delimitedGrid(src)
  return csv ? [csv] : []
}

function cell(raw: unknown): Cell | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number' || typeof raw === 'boolean') return { v: raw, w: String(raw) }
  if (typeof raw === 'object') return null
  let w = String(raw).trim()
  if (!w) return null
  let link: string | undefined
  // [text](https://…) and <https://…> as Markdown writes links.
  const md = w.match(/^\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)$/)
  if (md) {
    link = md[2]
    w = md[1].trim() || md[2]
  } else {
    const angle = w.match(/^<(https?:\/\/[^>\s]+)>$/)
    if (angle) w = angle[1]
  }
  return { v: w, w, link }
}

// ---------- JSON ----------

function jsonGrid(src: string): Grid | null {
  const t = src.trim()
  // An AI may wrap it in a code fence.
  const body = t.replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1').trim()
  if (!/^[[{]/.test(body)) return null
  let data: unknown
  try {
    data = JSON.parse(body)
  } catch {
    return null
  }
  // { "products": [ … ] } as well as [ … ]
  const list = Array.isArray(data) ? data : Object.values(data as Record<string, unknown>).find(Array.isArray)
  const rows = (list ?? []).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)).slice(0, MAX_ROWS)
  if (!rows.length) return null
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  return [headers.map((h) => cell(h)), ...rows.map((r) => headers.map((h) => cell(Array.isArray(r[h]) ? (r[h] as unknown[]).join(', ') : r[h])))]
}

// ---------- Markdown ----------

const SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  const out: string[] = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cur += '|'
      i++
    } else if (s[i] === '|') {
      out.push(cur)
      cur = ''
    } else cur += s[i]
  }
  out.push(cur)
  return out.map((c) =>
    c
      .trim()
      // Emphasis an AI likes to add: **Arvika** → Arvika; <br> as a line break.
      .replace(/^(\*\*|__|`)(.*)\1$/, '$2')
      .replace(/<br\s*\/?>/gi, ' / ')
      .trim(),
  )
}

function markdownGrids(src: string): Grid[] {
  const lines = src.split(/\r?\n/)
  const grids: Grid[] = []
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!lines[i].includes('|') || !SEPARATOR.test(lines[i + 1]) || !lines[i + 1].includes('-')) continue
    const header = splitRow(lines[i])
    if (header.length < 2) continue
    const grid: Grid = [header.map(cell)]
    let j = i + 2
    for (; j < lines.length && lines[j].includes('|') && lines[j].trim() && grid.length <= MAX_ROWS; j++) grid.push(splitRow(lines[j]).map(cell))
    grids.push(grid)
    i = j - 1
  }
  return grids
}

// ---------- CSV / TSV ----------

/** RFC 4180: quoted fields may hold the delimiter, quotes ("") and line breaks. */
function parseDelimited(src: string, d: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"' && !cur.trim()) {
      quoted = true
      cur = ''
    } else if (c === d) {
      row.push(cur)
      cur = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cur)
      rows.push(row)
      row = []
      cur = ''
      if (rows.length > MAX_ROWS) break
    } else cur += c
  }
  if (cur || row.length) {
    row.push(cur)
    rows.push(row)
  }
  return rows.filter((r) => r.some((x) => x.trim()))
}

function delimitedGrid(src: string): Grid | null {
  let best: string[][] | null = null
  let bestScore = 0
  for (const d of ['\t', ';', ',']) {
    const rows = parseDelimited(src, d)
    if (rows.length < 2 || rows[0].length < 2) continue
    // The delimiter that gives most rows the header's width wins.
    const consistent = rows.filter((r) => r.length === rows[0].length).length / rows.length
    const score = consistent * rows[0].length
    if (consistent >= 0.6 && score > bestScore) {
      best = rows
      bestScore = score
    }
  }
  return best && best.map((r) => r.map(cell))
}
