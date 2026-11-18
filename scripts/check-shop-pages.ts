/**
 * Zero-token check of the shop-page import against real data.
 *
 * Reads a Propario backup (Backup → Download backup), takes up to N products per shop, reads
 * each product page once – with the app's own guarded client: no disguise, bot walls respected,
 * one request per page and a pause between them – and runs the app's extraction and field
 * mapping (server/product-image.ts, src/domain/page-import.ts). The result is compared with the
 * values the products hold today, so it shows per shop how much a new product would get on its
 * own and where the page says something else.
 *
 *   node --disable-warning=ExperimentalWarning scripts/check-shop-pages.ts <backup.json> [per shop, default 2]
 *
 * Prints a report. Backup and report hold personal data: keep them out of the repository.
 */
import fs from 'node:fs'
import { makeProduct } from '../src/db/factories.ts'
import type { BackupFile, Product, PropertyDef } from '../src/db/types.ts'
import { DIMENSION_UNIT, meaning, planFacts } from '../src/domain/page-import.ts'
import { extractProductFacts, fetchProductPage, ImageFetchError } from '../server/product-image.ts'

const [file, perShopArg] = process.argv.slice(2)
if (!file) {
  console.error('Usage: node scripts/check-shop-pages.ts <backup.json> [per shop]')
  process.exit(2)
}
const backup = JSON.parse(fs.readFileSync(file, 'utf8')) as BackupFile
const perShop = Math.max(1, Number(perShopArg ?? 2))
const PAUSE_MS = 1500

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Same value, allowing for rounding and spelling ("Weiß" vs "weiß", 60 vs 60.2). */
function agrees(today: unknown, page: unknown): boolean {
  if (typeof today === 'number' && typeof page === 'number') return Math.abs(today - page) <= Math.max(0.5, Math.abs(today) * 0.02)
  const a = String(today).toLowerCase().trim()
  const b = String(page).toLowerCase().trim()
  return a === b || (a.length > 2 && b.includes(a)) || (b.length > 2 && a.includes(b))
}

const CORE = ['brand', 'model', 'productType', 'variant', 'price', 'gtin', 'mpn'] as const

interface Row {
  host: string
  product: string
  status: string
  have: number
  covered: number
  agree: number
  specs: number
  extras: number
  differ: string[]
  missing: string[]
}

const shops = new Map<string, Product[]>()
for (const p of backup.products) {
  const h = host(p.url ?? '')
  if (h) shops.set(h, [...(shops.get(h) ?? []), p])
}

const rows: Row[] = []
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
for (const [h, products] of [...shops].sort((a, b) => b[1].length - a[1].length)) {
  for (const p of products.slice(0, perShop)) {
    const name = [p.brand, p.model].filter(Boolean).join(' ') || '(ohne Namen)'
    const row: Row = { host: h, product: name, status: 'ok', have: 0, covered: 0, agree: 0, specs: 0, extras: 0, differ: [], missing: [] }
    rows.push(row)
    let html: string
    try {
      html = await fetchProductPage(p.url)
    } catch (e) {
      row.status = e instanceof ImageFetchError ? e.code : 'failed'
      await sleep(PAUSE_MS)
      continue
    }
    await sleep(PAUSE_MS)
    const facts = extractProductFacts(html)
    const fields: PropertyDef[] = (backup.properties ?? []).filter((x) => x.projectId === p.projectId)
    // As if the product had just been added by its link: nothing filled yet.
    const plan = planFacts(makeProduct(p.projectId, { url: p.url }), facts, fields)
    row.specs = facts.specs?.length ?? 0
    row.extras = Object.keys(plan.patch.extra ?? {}).length

    const check = (label: string, today: unknown, page: unknown) => {
      if (today === undefined || today === null || today === '') return
      row.have++
      if (page === undefined || page === null || page === '') return void row.missing.push(label)
      row.covered++
      if (agrees(today, page)) row.agree++
      else row.differ.push(`${label}: heute ${String(today)} · Seite ${String(page)}`)
    }
    for (const key of CORE) check(key, p[key], plan.patch[key])
    for (const f of fields) {
      const created = plan.create.find((c) => c.dimension === meaning(f.name))
      // A created width in cm compares with a field "Breite" only when that field is in cm too.
      const fromCreated = created && (!f.unit || f.unit === DIMENSION_UNIT[created.dimension]) ? created.value : undefined
      check(f.name, p.values?.[f.id], plan.patch.values?.[f.id] ?? fromCreated)
    }
  }
}

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)} %` : '–')
console.log(`Shops: ${shops.size} · geprüfte Seiten: ${rows.length}\n`)
for (const r of rows) {
  console.log(`## ${r.host} – ${r.product}`)
  if (r.status !== 'ok') {
    console.log(`   Seite nicht lesbar: ${r.status}\n`)
    continue
  }
  console.log(
    `   Abdeckung ${r.covered}/${r.have} (${pct(r.covered, r.have)}), davon übereinstimmend ${r.agree} · Datenblattzeilen ${r.specs} · Extras ${r.extras}`,
  )
  if (r.missing.length) console.log(`   fehlt auf der Seite: ${r.missing.join(', ')}`)
  for (const d of r.differ) console.log(`   abweichend: ${d}`)
  console.log()
}
const ok = rows.filter((r) => r.status === 'ok')
const sum = (k: 'have' | 'covered' | 'agree') => ok.reduce((n, r) => n + r[k], 0)
console.log(`Gesamt: lesbar ${ok.length}/${rows.length} · Abdeckung ${pct(sum('covered'), sum('have'))} · übereinstimmend ${pct(sum('agree'), sum('covered'))}`)
