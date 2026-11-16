/**
 * Excel import: turns a workbook into editable drafts (analysis), then into
 * project bundles (commit). Hand-maintained sheets differ, so every decision
 * made here is shown in the import wizard and can be corrected there.
 */
import * as XLSX from 'xlsx'
import { makeProduct, makeProject, makeProperty, makeRequirement } from '../db/factories'
import type { Condition, ConditionOp, Priority, Product, PropertyDef, PropertyType } from '../db/types'
import type { ProjectBundle } from '../db/repo'
import { coerceValue, dateToIso, looksLikeUrl, normalizeUrl, parseBoolean, parseDate, parseLeadingNumber, parseNumber } from '../domain/values'
import { isUnit, nameTokens, norm, splitUnit, suggestCategory } from './normalize'
import { priorityFor, productTargetFor, reqTargetFor, sectionKind, SINGLE_TARGETS, type FieldTarget, type ReqTarget } from './synonyms'

// ---------- grid ----------

export interface Cell {
  /** Raw value: string, number, boolean or Date. */
  v: string | number | boolean | Date
  /** Displayed text. */
  w: string
  /** Hyperlink target, if the cell has one. */
  link?: string
}

export type Grid = (Cell | null)[][]

function cellText(c: Cell | null | undefined): string {
  return c ? c.w.trim() : ''
}

export function sheetToGrid(ws: XLSX.WorkSheet): Grid {
  // Ranges like A1:AT1048576 are common in old sheets; use the cells that really exist.
  let maxR = -1
  let maxC = -1
  const cells: [number, number, Cell][] = []
  for (const key of Object.keys(ws)) {
    if (key[0] === '!') continue
    const c = ws[key] as XLSX.CellObject
    if (c.v === undefined || c.v === null || c.v === '') continue
    if (typeof c.v === 'string' && !c.v.trim() && !c.l) continue
    const { r, c: col } = XLSX.utils.decode_cell(key)
    let v = c.v as Cell['v']
    // Numbers that Excel shows with a date format (e.g. "1.4" typed into a date cell) come back as 1900 dates.
    if (v instanceof Date && v.getFullYear() < 1910) v = Math.round(((v.getTime() - Date.UTC(1899, 11, 30)) / 86400000) * 1000) / 1000
    const w = v instanceof Date ? dateToIso(v) : c.w !== undefined && typeof c.v !== 'string' ? c.w : String(v)
    cells.push([r, col, { v, w, link: c.l?.Target ?? hyperlinkFormula(c.f) }])
    maxR = Math.max(maxR, r)
    maxC = Math.max(maxC, col)
  }
  const grid: Grid = Array.from({ length: maxR + 1 }, () => Array(maxC + 1).fill(null))
  for (const [r, col, cell] of cells) grid[r][col] = cell
  return grid
}

/** Target of a `=HYPERLINK("url"; "text")` formula. */
function hyperlinkFormula(f: string | undefined): string | undefined {
  const m = f?.match(/^\s*HYPERLINK\(\s*"([^"]+)"/i)
  return m ? m[1] : undefined
}

const rowFilled = (row: (Cell | null)[] | undefined) => (row ?? []).filter((c) => cellText(c) || c?.link)

// ---------- drafts ----------

export interface ColumnMapping {
  index: number
  header: string
  target: FieldTarget
  /** For `personNote`. */
  person: string
  /** For `property`. */
  propertyName: string
  propertyType: PropertyType
  unit: string
  options: string[]
  /** False when the mapping is a guess the user should look at. */
  confident: boolean
  samples: string[]
}

export interface ReqColumn {
  index: number
  header: string
  target: ReqTarget
}

export interface DraftCondition {
  /** Property name as in the mapping, or `null` for the price. */
  propertyName: string | null
  op: ConditionOp
  value: number | string
}

export interface DraftRequirement {
  include: boolean
  category: string
  label: string
  description: string
  priority: Priority
  condition: DraftCondition | null
}

export type SheetKind = 'products' | 'requirements' | 'skip'

export interface SheetDraft {
  sheetName: string
  kind: SheetKind
  include: boolean
  projectName: string
  category: string
  /** 0-based header row. */
  headerRow: number
  /** First row after the product rows (exclusive end). */
  dataEnd: number
  columns: ColumnMapping[]
  reqColumns: ReqColumn[]
  requirements: DraftRequirement[]
  notes: string
  /** For requirement sheets: the products sheet they belong to. */
  attachTo: string | null
  productRowCount: number
  warnings: string[]
}

export interface WorkbookDraft {
  fileName: string
  sheets: SheetDraft[]
  grids: Record<string, Grid>
}

export interface AnalyzeOptions {
  people: string[]
}

export function readWorkbook(data: ArrayBuffer | Uint8Array): XLSX.WorkBook {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  return XLSX.read(bytes, { type: 'array', cellDates: true, cellStyles: false })
}

export function analyzeWorkbook(wb: XLSX.WorkBook, fileName: string, opts: AnalyzeOptions): WorkbookDraft {
  const grids: Record<string, Grid> = {}
  for (const name of wb.SheetNames) grids[name] = sheetToGrid(wb.Sheets[name])
  const sheets = wb.SheetNames.map((name) => analyzeSheet(name, grids[name], opts))

  const productSheets = sheets.filter((s) => s.kind === 'products')
  const reqSheets = sheets.filter((s) => s.kind === 'requirements')
  const baseName = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
  if (productSheets.length === 1 && (reqSheets.length > 0 || wb.SheetNames.length === 1)) {
    productSheets[0].projectName = baseName || productSheets[0].projectName
    productSheets[0].category = suggestCategory(productSheets[0].projectName) || productSheets[0].category
  }
  for (const r of reqSheets) r.attachTo = productSheets[0]?.sheetName ?? null
  // Conditions can only be resolved once the target sheet's properties are known.
  for (const r of reqSheets) {
    const target = sheets.find((s) => s.sheetName === r.attachTo)
    if (target) for (const req of r.requirements) req.condition ??= guessCondition(req, target.columns)
  }
  return { fileName, sheets, grids }
}

// ---------- header detection ----------

function scoreHeaderRow(row: (Cell | null)[]): { product: number; req: number } {
  let product = 0
  let req = 0
  const targets = new Set<string>()
  for (const c of row) {
    const t = cellText(c)
    if (!t || typeof c?.v !== 'string') continue
    const pt = productTargetFor(t)
    if (pt && pt !== 'ignore' && !targets.has(pt)) {
      product++
      targets.add(pt)
    }
    const rt = reqTargetFor(t)
    if (rt && rt !== 'ignore') req++
  }
  return { product, req }
}

export function detectHeader(grid: Grid): { row: number; kind: SheetKind } {
  let best = { row: -1, score: 0, kind: 'skip' as SheetKind }
  for (let r = 0; r < Math.min(grid.length, 20); r++) {
    const filled = rowFilled(grid[r]).length
    if (filled < 2) continue
    const { product, req } = scoreHeaderRow(grid[r])
    const hasReqCore = grid[r].some((c) => reqTargetFor(cellText(c)) === 'label') && grid[r].some((c) => reqTargetFor(cellText(c)) === 'priority')
    if (hasReqCore && req >= 2 && req > best.score) best = { row: r, score: req, kind: 'requirements' }
    else if (product >= 2 && product > best.score) best = { row: r, score: product, kind: 'products' }
  }
  return { row: best.row, kind: best.kind }
}

// ---------- sheet analysis ----------

export function analyzeSheet(sheetName: string, grid: Grid, opts: AnalyzeOptions, forcedHeaderRow?: number): SheetDraft {
  const detected = detectHeader(grid)
  const headerRow = forcedHeaderRow ?? detected.row
  const kind: SheetKind = forcedHeaderRow !== undefined ? (detected.kind === 'requirements' ? 'requirements' : 'products') : detected.kind
  const draft: SheetDraft = {
    sheetName,
    kind,
    include: kind !== 'skip',
    projectName: sheetName.trim(),
    category: suggestCategory(sheetName),
    headerRow: Math.max(headerRow, 0),
    dataEnd: grid.length,
    columns: [],
    reqColumns: [],
    requirements: [],
    notes: '',
    attachTo: null,
    productRowCount: 0,
    warnings: [],
  }
  if (headerRow < 0 || kind === 'skip') {
    draft.kind = 'skip'
    draft.include = false
    draft.warnings.push('noHeader')
    return draft
  }

  const pre = grid
    .slice(0, headerRow)
    .map(rowFilled)
    .filter((r) => r.length)
    .map((r) => r.map(cellText).join(' · '))

  if (kind === 'requirements') {
    draft.reqColumns = (grid[headerRow] ?? []).map((c, index) => ({
      index,
      header: cellText(c),
      target: reqTargetFor(cellText(c)) ?? 'ignore',
    }))
    draft.requirements = readRequirementRows(grid, draft)
    draft.notes = pre.join('\n')
    return draft
  }

  // Product rows end where a trailing section such as "Anforderungen" starts.
  let end = grid.length
  for (let r = headerRow + 1; r < grid.length; r++) {
    const filled = rowFilled(grid[r])
    if (filled.length && filled.length <= 3 && sectionKind(cellText(filled[0]))) {
      end = r
      break
    }
  }
  draft.dataEnd = end
  draft.columns = mapColumns(grid, headerRow, end, opts)
  draft.productRowCount = productRows(grid, draft).length

  const trailing = parseTrailing(grid.slice(end), opts.people)
  draft.requirements = trailing.requirements.map((r) => ({ ...r, condition: r.condition ?? guessCondition(r, draft.columns) }))
  draft.notes = [...pre, trailing.notes].filter(Boolean).join('\n\n')
  if (draft.productRowCount === 0) draft.warnings.push('noProducts')
  if (!draft.columns.some((c) => c.target === 'model' || c.target === 'brand')) draft.warnings.push('noNameColumn')
  return draft
}

/** Re-runs the analysis with a header row chosen by the user. */
export function reanalyzeSheet(wbDraft: WorkbookDraft, sheetName: string, headerRow: number, opts: AnalyzeOptions): SheetDraft {
  const prev = wbDraft.sheets.find((s) => s.sheetName === sheetName)!
  const next = analyzeSheet(sheetName, wbDraft.grids[sheetName], opts, headerRow)
  return { ...next, projectName: prev.projectName, category: prev.category, attachTo: prev.attachTo }
}

function columnValues(grid: Grid, col: number, from: number, to: number): Cell[] {
  const out: Cell[] = []
  for (let r = from; r < to; r++) {
    const c = grid[r]?.[col]
    if (c && (cellText(c) || c.link)) out.push(c)
  }
  return out
}

function mapColumns(grid: Grid, headerRow: number, end: number, opts: AnalyzeOptions): ColumnMapping[] {
  const header = grid[headerRow] ?? []
  const width = Math.max(header.length, ...grid.slice(headerRow + 1, end).map((r) => r.length))
  const used = new Set<FieldTarget>()
  const people = new Map(opts.people.map((p) => [norm(p), p]))
  const cols: ColumnMapping[] = []

  for (let i = 0; i < width; i++) {
    const values = columnValues(grid, i, headerRow + 1, end)
    const rawHeader = cellText(header[i])
    if (!rawHeader && values.length === 0) continue
    const headerText = rawHeader || `${XLSX.utils.encode_col(i)}`
    let target = (rawHeader && productTargetFor(rawHeader)) || null
    let confident = target !== null
    let person = ''
    if (!target && rawHeader && people.has(norm(rawHeader))) {
      target = 'personNote'
      person = people.get(norm(rawHeader))!
      confident = true
    }
    // Result columns written by the app's own Excel export are derived data.
    if (/^(check|prüfung)\s*:/i.test(rawHeader)) {
      target = 'ignore'
      confident = true
    }
    if (target && SINGLE_TARGETS.includes(target) && used.has(target)) {
      target = 'property'
      confident = false
    }
    if (!rawHeader && values.length && values.every((v) => looksLikeUrl(v.link ?? cellText(v)))) {
      target = 'link'
      confident = true
    }
    target ??= 'property'
    used.add(target)

    const inferred = inferType(values)
    const split = inferred.type === 'number' ? splitUnit(headerText) : { name: headerText, unit: '' }
    cols.push({
      index: i,
      header: headerText,
      target,
      person,
      propertyName: split.name,
      propertyType: inferred.type,
      unit: split.unit || inferred.unit,
      options: inferred.options,
      confident: target === 'property' ? Boolean(rawHeader) : confident,
      samples: values.slice(0, 3).map((v) => cellText(v)),
    })
  }
  return cols
}

const BOOL_WORDS = /^(ja|nein|yes|no|true|false|wahr|falsch)$/i

/** Guesses the property type of a column; tolerant so one odd value does not turn a number column into text. */
export function inferType(values: Cell[]): { type: PropertyType; unit: string; options: string[] } {
  const none = { unit: '', options: [] as string[] }
  if (values.length === 0) return { type: 'text', ...none }
  const n = values.length
  const texts = values.map((v) => cellText(v))
  const share = (f: (c: Cell, t: string) => boolean) => values.filter((c, i) => f(c, texts[i])).length / n

  if (share((c, t) => looksLikeUrl(c.link ?? t)) >= 0.8) return { type: 'url', ...none }
  if (share((_, t) => BOOL_WORDS.test(t)) >= 0.8 && n >= 1) return { type: 'boolean', ...none }
  if (share((c) => c.v instanceof Date) >= 0.8) return { type: 'date', ...none }
  // Numbers, optionally with a known unit written into the value ("38g", "90 kW").
  const unitOf = (t: string) => t.replace(/^[-+~]?[\d\s.,']*/, '').trim()
  const isNum = (c: Cell, t: string) => typeof c.v === 'number' || (parseNumber(t) !== null && (!unitOf(t) || isUnit(unitOf(t))))
  const numeric = values.filter((c, i) => isNum(c, texts[i])).length
  const singleIsNumber = n === 1 && typeof values[0].v === 'number'
  if (numeric >= 2 ? numeric / n >= 0.6 : singleIsNumber) {
    const suffixes = new Set(texts.filter((t, i) => typeof values[i].v === 'string' && isUnit(unitOf(t))).map(unitOf))
    return { type: 'number', unit: suffixes.size === 1 ? [...suffixes][0] : '', options: [] }
  }
  const distinct = [...new Set(texts)]
  const withDigits = distinct.filter((d) => /\d/.test(d)).length
  if (n >= 4 && distinct.length <= 6 && distinct.length < n && distinct.every((d) => d.length <= 20) && withDigits <= distinct.length * 0.3) {
    return { type: 'select', unit: '', options: distinct }
  }
  return { type: 'text', ...none }
}

// ---------- product rows ----------

function productRows(grid: Grid, draft: SheetDraft): number[] {
  const nameCols = draft.columns.filter((c) => c.target === 'model' || c.target === 'brand').map((c) => c.index)
  const mapped = draft.columns.filter((c) => c.target !== 'ignore').map((c) => c.index)
  const rows: number[] = []
  for (let r = draft.headerRow + 1; r < draft.dataEnd; r++) {
    const row = grid[r] ?? []
    const hasName = nameCols.some((i) => cellText(row[i]))
    const count = mapped.filter((i) => cellText(row[i]) || row[i]?.link).length
    if (hasName || count >= 2) rows.push(r)
  }
  return rows
}

function appendText(a: string, b: string): string {
  return a ? `${a}\n${b}` : b
}

/** Reads one product from a row using the (possibly user-corrected) mapping. */
export function rowToProduct(row: (Cell | null)[], draft: SheetDraft, projectId: string, propIds: Map<number, string>): Product {
  const p = makeProduct(projectId)
  const links = new Set<string>()

  for (const col of draft.columns) {
    const cell = row[col.index]
    if (!cell) continue
    const text = cellText(cell)
    if (cell.link && col.target !== 'url' && col.target !== 'link' && col.target !== 'imageUrl') {
      // Hyperlinks on model names are the product page; others are kept as extra links.
      if (col.target === 'model' && !p.url) p.url = cell.link
      else links.add(cell.link)
    }
    if (!text && col.target !== 'url' && col.target !== 'link') continue
    const keep = () => {
      p.extra[col.header] = text
    }

    switch (col.target) {
      case 'ignore':
        break
      case 'priceNote':
        p.priceNote = appendText(p.priceNote, text)
        break
      case 'brand':
      case 'model':
      case 'productType':
      case 'retailer':
      case 'variant':
      case 'foundBy':
        p[col.target] = text
        break
      case 'description':
      case 'comments':
      case 'exclusionReason':
      case 'overall':
      case 'pros':
      case 'cons':
        p[col.target] = appendText(p[col.target], text)
        break
      case 'price': {
        const n = typeof cell.v === 'number' ? cell.v : parseNumber(text)
        if (n !== null) p.price = n
        else {
          p.price = parseLeadingNumber(text)
          p.priceNote = text
        }
        break
      }
      case 'purchasePrice': {
        const n = typeof cell.v === 'number' ? cell.v : parseNumber(text)
        if (n !== null) p.purchase.price = n
        else keep()
        if (p.purchase.status === 'none') p.purchase.status = 'purchased'
        break
      }
      case 'url':
      case 'link':
      case 'imageUrl': {
        const href = cell.link ?? (looksLikeUrl(text) ? normalizeUrl(text) : '')
        if (!href) {
          if (text) keep()
          break
        }
        if (col.target === 'imageUrl') p.imageUrl = href
        else if (col.target === 'url' && !p.url) p.url = href
        else links.add(href)
        break
      }
      case 'favoriteRank': {
        const n = parseNumber(cell.v)
        if (n !== null) p.favoriteRank = n
        else keep()
        break
      }
      case 'candidate': {
        const c = candidateFor(text)
        if (c) p.candidate = c
        else {
          keep()
        }
        break
      }
      case 'purchaseDate': {
        if (parseBoolean(text) === false) break
        p.purchase.status = 'purchased'
        const iso = parseDate(cell.v)
        if (iso) p.purchase.date = iso
        else if (parseBoolean(text) !== true) p.purchase.note = appendText(p.purchase.note, text)
        break
      }
      case 'personNote': {
        const n = typeof cell.v === 'number' ? cell.v : null
        const starMatch = text.match(/^(★{1,5})\s*(.*)$/s)
        p.ratings.push(
          n !== null && n >= 1 && n <= 5 && Number.isInteger(n)
            ? { person: col.person, stars: n, note: '' }
            : starMatch
              ? { person: col.person, stars: starMatch[1].length, note: starMatch[2] }
              : { person: col.person, stars: null, note: text },
        )
        break
      }
      case 'property': {
        const id = propIds.get(col.index)
        if (!id) break
        const raw = cell.v instanceof Date ? cell.v : typeof cell.v === 'number' || typeof cell.v === 'boolean' ? cell.v : text
        const coerced = coerceValue(col.propertyType, col.propertyType === 'url' ? (cell.link ?? text) : raw)
        if (coerced.value !== null) p.values[id] = coerced.value
        break
      }
    }
  }
  links.delete(p.url)
  p.links = [...links]
  return p
}

function candidateFor(text: string): Product['candidate'] | null {
  const t = norm(text)
  if (/^(favorit|favourite|favorite|top|shortlist|ja|yes|x|✓)$/.test(t)) return 'favorite'
  if (/^(nein|no|ausgeschieden|ausgeschlossen|excluded|raus|verworfen)$/.test(t)) return 'excluded'
  if (/^(offen|open|neu|new)$/.test(t)) return 'open'
  return null
}

export interface PreviewRow {
  name: string
  price: string
  url: string
  candidate: Product['candidate']
  purchased: boolean
  propertyCount: number
}

export function previewProducts(wb: WorkbookDraft, draft: SheetDraft): PreviewRow[] {
  const grid = wb.grids[draft.sheetName]
  const propIds = new Map(draft.columns.filter((c) => c.target === 'property').map((c) => [c.index, String(c.index)]))
  return productRows(grid, draft).map((r) => {
    const p = rowToProduct(grid[r], draft, 'preview', propIds)
    return {
      name: [p.brand, p.model].filter(Boolean).join(' ') || '—',
      price: p.priceNote || (p.price !== null ? String(p.price) : ''),
      url: p.url,
      candidate: p.candidate,
      purchased: p.purchase.status === 'purchased',
      propertyCount: Object.keys(p.values).length,
    }
  })
}

// ---------- requirements ----------

/** Re-reads a requirement sheet after the user changed its column mapping. */
export function rereadRequirements(wb: WorkbookDraft, draft: SheetDraft): DraftRequirement[] {
  const target = wb.sheets.find((s) => s.sheetName === draft.attachTo)
  return readRequirementRows(wb.grids[draft.sheetName], draft).map((r) => ({
    ...r,
    condition: r.condition ?? (target ? guessCondition(r, target.columns) : null),
  }))
}

function readRequirementRows(grid: Grid, draft: SheetDraft): DraftRequirement[] {
  const col = (t: ReqTarget) => draft.reqColumns.filter((c) => c.target === t).map((c) => c.index)
  const out: DraftRequirement[] = []
  for (let r = draft.headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const get = (t: ReqTarget) =>
      col(t)
        .map((i) => cellText(row[i]))
        .filter(Boolean)
        .join(' · ')
    const label = get('label')
    if (!label) continue
    const rule = get('rule')
    out.push({
      include: true,
      category: get('category'),
      label,
      description: get('description'),
      priority: priorityFor(get('priority')) ?? 'important',
      condition: rule ? parseRuleText(rule) : null,
    })
  }
  return out
}

/** Parses rules as written by the app's own Excel export: "Tiefe (cm) ≤ 40" or "Preis ≤ 500". */
export function parseRuleText(rule: string): DraftCondition | null {
  const m = rule.match(/^(.*?)\s*(≤|<=|<|≥|>=|>|=|≠|!=)\s*(.+)$/)
  if (!m) return null
  const ops: Record<string, ConditionOp> = { '≤': 'lte', '<=': 'lte', '<': 'lt', '≥': 'gte', '>=': 'gte', '>': 'gt', '=': 'eq', '≠': 'neq', '!=': 'neq' }
  const name = m[1].trim()
  const isPrice = /^(preis|price)$/i.test(name)
  const bool = parseBoolean(m[3])
  if (bool !== null && (m[2] === '=' || m[2] === '≠') && !/^\d/.test(m[3])) {
    return { propertyName: name, op: bool === (m[2] === '=') ? 'isTrue' : 'isFalse', value: '' }
  }
  const n = parseNumber(m[3])
  return { propertyName: isPrice ? null : name, op: ops[m[2]], value: n ?? m[3].trim() }
}

interface Trailing {
  requirements: DraftRequirement[]
  notes: string
}

/** Splits the free-form area below the product rows into requirements and notes. */
export function parseTrailing(rows: Grid, people: string[]): Trailing {
  const peopleSet = new Set(people.map(norm))
  const requirements: DraftRequirement[] = []
  const notes: string[] = []
  let mode: 'requirements' | 'notes' = 'notes'
  let category = ''
  let columnCategories: Map<number, string> | null = null
  let noteBlock: string[] = []

  const flushNotes = () => {
    if (noteBlock.length) notes.push(noteBlock.join('\n'))
    noteBlock = []
  }

  for (const row of rows) {
    const cells = (row ?? []).map((c, i) => ({ i, c })).filter(({ c }) => cellText(c) || c?.link)
    if (!cells.length) continue
    const first = cellText(cells[0].c)
    const kind = cells.length <= 3 ? sectionKind(first) : null

    if (kind) {
      flushNotes()
      mode = kind
      columnCategories = null
      if (kind === 'requirements') {
        category = first
          .replace(/anforderungen?/i, '')
          .replace(/\s+/g, ' ')
          .trim()
      } else {
        // Keep the heading and anything written next to it.
        noteBlock.push(cells.map(({ c }) => cellText(c)).join(' · '))
      }
      continue
    }

    if (mode === 'notes') {
      noteBlock.push(cells.map(({ c }) => (c?.link && !cellText(c).startsWith('http') ? `${cellText(c)} (${c.link})` : cellText(c))).join(' · '))
      continue
    }

    // Requirement rows
    const texts = cells.map(({ c }) => cellText(c))
    if (cells.every(({ c }) => peopleSet.has(norm(cellText(c))))) {
      columnCategories = new Map(cells.map(({ i, c }) => [i, cellText(c)]))
      continue
    }
    if (texts.length === 1 && (looksLikeUrl(texts[0]) || cells[0].c?.link)) {
      noteBlock.push(cells[0].c?.link ?? texts[0])
      continue
    }
    if (columnCategories && cells.length >= 1) {
      for (const { i, c } of cells) {
        const req = requirementFromRow([cellText(c)], columnCategories.get(i) ?? category)
        if (req) requirements.push(req)
      }
      continue
    }
    const req = requirementFromRow(texts, category)
    if (req) requirements.push(req)
  }
  flushNotes()
  return { requirements, notes: notes.join('\n\n') }
}

function newReq(category: string, label: string, description: string, priority: Priority, condition: DraftCondition | null = null): DraftRequirement {
  return { include: true, category, label, description, priority, condition }
}

const AMOUNT_ONLY = /^(max\.?\s*)?[\d.,]+\s*(€|eur|euro)$/i
const BUDGET_LABEL = /^(preis|budget|price|max\.? ?preis|preisrange|preisrahmen|höchstpreis|preisgrenze)/i

function requirementFromRow(texts: string[], category: string): DraftRequirement | null {
  const [first, ...rest] = texts
  const prio = priorityFor(first)
  if (prio && rest.length) return newReq(category, rest.join(' · '), '', prio)
  if (prio && !rest.length) return null

  if (texts.length === 1 && AMOUNT_ONLY.test(first)) {
    return newReq(category, 'Budget', first, 'important', { propertyName: null, op: 'lte', value: parseNumber(first.replace(/^max\.?\s*/i, ''))! })
  }
  if (BUDGET_LABEL.test(first) && rest.length) {
    const n = parseNumber(rest[0])
    if (n !== null) return newReq(category, first.replace(/:$/, ''), rest.join(' · '), 'important', { propertyName: null, op: 'lte', value: n })
  }
  return newReq(category, first.replace(/:$/, '').trim(), rest.join(' · '), 'important')
}

const LTE = /(^|\s)(max|maximal\w*|höchstens|bis|unter|kleiner|weniger|at most|up to|below|under|≤)(\s|\.|:|$)/i
const GTE = /(^|\s)(min|mind|minimal\w*|mindestens|ab|über|größer|mehr als|at least|above|over|≥)(\s|\.|:|$)/i

/**
 * Derives a checkable rule from a requirement such as "Maximale Tiefe – Maximal 40 cm"
 * when a numeric property with a matching name exists. Returns null when unsure.
 */
export function guessCondition(req: DraftRequirement, columns: ColumnMapping[]): DraftCondition | null {
  if (req.priority === 'info') return null
  const text = `${req.label} ${req.description}`
  const op: ConditionOp | null = LTE.test(req.label)
    ? 'lte'
    : GTE.test(req.label)
      ? 'gte'
      : LTE.test(req.description)
        ? 'lte'
        : GTE.test(req.description)
          ? 'gte'
          : null
  if (!op) return null
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(cm|mm|m|kg|g|l|w|€|eur|zoll|"|gb|tb|h|db)?/i)
  if (!m) return null
  const value = parseNumber(m[1])
  if (value === null) return null

  const tokens = nameTokens(req.label)
  if (!tokens.length) return null
  if (tokens.some((t) => /^(preis|budget|price|kosten)/.test(t))) return { propertyName: null, op, value }

  const candidates = columns
    .filter((c) => c.target === 'property' && c.propertyType === 'number')
    .map((c) => ({ c, pt: nameTokens(c.propertyName) }))
    .filter(({ pt }) => tokens.every((t) => pt.includes(t)))
    .sort((a, b) => a.pt.length - b.pt.length)
  if (!candidates.length) return null
  return { propertyName: candidates[0].c.propertyName, op, value }
}

// ---------- commit ----------

/**
 * Builds one project bundle per included product sheet. Requirement sheets are
 * merged into the project they are attached to.
 */
export function buildBundles(wb: WorkbookDraft): ProjectBundle[] {
  const bundles: ProjectBundle[] = []
  const byName = new Map<string, ProjectBundle>()

  for (const sheet of wb.sheets) {
    if (!sheet.include || sheet.kind !== 'products') continue
    const grid = wb.grids[sheet.sheetName]
    const project = makeProject({
      name: sheet.projectName.trim() || sheet.sheetName,
      category: sheet.category.trim(),
      notes: sheet.notes,
    })

    const propIds = new Map<number, string>()
    const properties: PropertyDef[] = []
    for (const col of sheet.columns) {
      if (col.target !== 'property') continue
      const prop = makeProperty(project.id, {
        name: col.propertyName.trim() || col.header,
        type: col.propertyType,
        unit: col.unit,
        options: col.propertyType === 'select' ? col.options : [],
        order: properties.length,
      })
      properties.push(prop)
      propIds.set(col.index, prop.id)
    }

    const products = productRows(grid, sheet).map((r, i) => ({ ...rowToProduct(grid[r], sheet, project.id, propIds), order: i }))
    // Select options must include every imported value.
    for (const prop of properties) {
      if (prop.type !== 'select') continue
      const seen = new Set(prop.options)
      for (const p of products) {
        const v = p.values[prop.id]
        if (typeof v === 'string' && !seen.has(v)) {
          seen.add(v)
          prop.options.push(v)
        }
      }
    }

    const purchased = products.filter((p) => p.purchase.status === 'purchased')
    if (purchased.length) {
      project.status = 'purchased'
      const latest = [...purchased].sort((a, b) => (a.purchase.date || '').localeCompare(b.purchase.date || '')).at(-1)!
      project.decisionProductId = latest.id
    } else if (products.some((p) => p.candidate === 'favorite')) {
      project.status = 'comparing'
    }

    const bundle: ProjectBundle = { project, properties, products, requirements: [] }
    addRequirements(bundle, sheet.requirements)
    bundles.push(bundle)
    byName.set(sheet.sheetName, bundle)
  }

  for (const sheet of wb.sheets) {
    if (!sheet.include || sheet.kind !== 'requirements' || !sheet.attachTo) continue
    const target = byName.get(sheet.attachTo)
    if (!target) continue
    addRequirements(target, sheet.requirements)
    if (sheet.notes) target.project.notes = [target.project.notes, sheet.notes].filter(Boolean).join('\n\n')
  }
  return bundles
}

function addRequirements(bundle: ProjectBundle, drafts: DraftRequirement[]) {
  for (const d of drafts) {
    if (!d.include || !d.label.trim()) continue
    bundle.requirements.push(
      makeRequirement(bundle.project.id, {
        category: d.category,
        label: d.label.trim(),
        description: d.description,
        priority: d.priority,
        condition: resolveCondition(d.condition, bundle.properties),
        order: bundle.requirements.length,
      }),
    )
  }
}

function resolveCondition(c: DraftCondition | null, props: PropertyDef[]): Condition | null {
  if (!c) return null
  if (c.propertyName === null) return { target: { kind: 'price' }, op: c.op, value: c.value }
  const wanted = norm(c.propertyName)
  const prop =
    props.find((p) => norm(p.name) === wanted) ??
    props.find((p) => norm(`${p.name} (${p.unit})`) === wanted) ??
    props.find((p) => norm(`${p.name} ${p.unit}`) === wanted)
  return prop ? { target: { kind: 'property', propertyId: prop.id }, op: c.op, value: c.value } : null
}
