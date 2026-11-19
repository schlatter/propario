import { isFavorite, statusOf } from '../domain/verdict'
import * as XLSX from 'xlsx'
import type { ProjectBundle } from '../db/repo'
import type { PropertyDef } from '../db/types'
import { evaluate, OP_SYMBOL } from '../domain/requirements'
import type { Messages } from '../i18n/en'
import { exclusionText } from '../domain/display'

/** Rule as text, readable by humans and by the importer ("Tiefe (cm) ≤ 40"). */
export function ruleText(b: ProjectBundle, m: Messages, reqIndex: number): string {
  const c = b.requirements[reqIndex].condition
  if (!c) return ''
  const prop = c.target.kind === 'property' ? b.properties.find((p) => p.id === (c.target as { propertyId: string }).propertyId) : null
  const name = c.target.kind === 'price' ? m.field.price : prop ? (prop.unit ? `${prop.name} (${prop.unit})` : prop.name) : '?'
  if (c.op === 'isTrue' || c.op === 'isFalse') return `${name} = ${c.op === 'isTrue' ? m.common.yes : m.common.no}`
  if (c.op === 'contains') return `${name} ${m.op.contains} ${c.value ?? ''}`
  return `${name} ${OP_SYMBOL[c.op]} ${c.value ?? ''}`
}

function propHeader(p: PropertyDef) {
  return p.unit ? `${p.name} (${p.unit})` : p.name
}

/** Builds a workbook whose headers the importer recognises again (round trip). */
export function bundleToWorkbook(b: ProjectBundle, m: Messages): XLSX.WorkBook {
  const props = new Map(b.properties.map((p) => [p.id, p]))
  const people = [...new Set(b.products.flatMap((p) => p.ratings.map((r) => r.person)).filter(Boolean))]
  const header = [
    m.field.brand,
    m.field.model,
    m.field.productType,
    m.field.price,
    m.field.priceNote,
    m.field.gtin,
    m.field.mpn,
    m.field.retailer,
    m.field.url,
    m.field.variant,
    m.field.candidate,
    m.field.exclusionReason,
    m.field.foundBy,
    ...b.properties.map(propHeader),
    ...people,
    m.field.overall,
    m.field.pros,
    m.field.cons,
    m.field.comments,
    m.field.description,
    m.field.purchaseDate,
    m.field.purchasePrice,
    ...b.requirements.filter((r) => r.priority !== 'info').map((r) => `${m.excel.result}: ${r.label}`),
  ]
  const rows: (string | number | boolean | null)[][] = [header]
  for (const p of b.products) {
    const ratingOf = (person: string) => {
      const r = p.ratings.find((x) => x.person === person)
      if (!r) return null
      return r.stars !== null && !r.note ? r.stars : [r.stars ? '★'.repeat(r.stars) : '', r.note].filter(Boolean).join(' ')
    }
    rows.push([
      p.brand,
      p.model,
      p.productType,
      p.price,
      p.priceNote,
      p.gtin ?? '',
      p.mpn ?? '',
      p.retailer,
      p.url,
      p.variant,
      isFavorite(p) ? m.verdict.favorite : m.candidate[statusOf(p)],
      exclusionText(p, m),
      p.foundBy,
      ...b.properties.map((prop) => {
        const v = p.values[prop.id]
        if (v === undefined || v === null) return null
        if (typeof v === 'boolean') return v ? m.common.yes : m.common.no
        return v
      }),
      ...people.map(ratingOf),
      p.overall,
      p.pros,
      p.cons,
      p.comments,
      p.description,
      p.purchase.status === 'purchased' ? p.purchase.date || m.purchase.purchased : p.purchase.status === 'ordered' ? m.purchase.ordered : null,
      p.purchase.price,
      ...b.requirements.filter((r) => r.priority !== 'info').map((r) => m.check[evaluate(r, p, props)]),
    ])
  }
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows)
  // Keep product links clickable in Excel.
  const urlCol = 6
  b.products.forEach((p, i) => {
    if (!p.url) return
    const ref = XLSX.utils.encode_cell({ r: i + 1, c: urlCol })
    if (ws[ref]) ws[ref].l = { Target: p.url }
  })
  ws['!cols'] = header.map((h) => ({ wch: Math.min(Math.max(String(h).length + 2, 10), 40) }))
  XLSX.utils.book_append_sheet(wb, ws, m.excel.productsSheet.slice(0, 31))

  const reqRows = [[m.field.category, m.field.requirement, m.field.priority, m.field.description, m.field.rule]]
  b.requirements.forEach((r, i) => reqRows.push([r.category, r.label, m.priority[r.priority], r.description, ruleText(b, m, i)]))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reqRows), m.excel.requirementsSheet.slice(0, 31))

  if (b.project.notes || b.project.description) {
    const notes = [b.project.description, b.project.notes]
      .filter(Boolean)
      .join('\n\n')
      .split('\n')
      .map((l) => [l])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(notes), m.excel.notesSheet.slice(0, 31))
  }
  return wb
}

export function workbookToBlob(wb: XLSX.WorkBook): Blob {
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
