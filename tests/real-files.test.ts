/**
 * Optional check against real workbooks, which are never committed.
 * Run: PV_XLSX="/path/a.xlsx:/path/b.xlsx" npx vitest run tests/real-files.test.ts
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyzeWorkbook, buildBundles, readWorkbook } from '../src/import/excel'
import { summarize } from '../src/domain/requirements'

const files = (process.env.PV_XLSX ?? '').split(':').filter(Boolean)

describe.skipIf(!files.length)('real workbooks', () => {
  for (const file of files) {
    it(`imports ${basename(file)}`, () => {
      const buf = readFileSync(file)
      const wb = readWorkbook(new Uint8Array(buf))
      const draft = analyzeWorkbook(wb, basename(file), { people: ['Ada', 'Grace', 'ChatGPT'] })
      const bundles = buildBundles(draft)
      const verbose = process.env.PV_VERBOSE === '1'
      for (const s of draft.sheets) {
        const cols = s.columns.map(
          (c) => `${c.header}→${c.target === 'property' ? `${c.propertyType}${c.unit ? `[${c.unit}]` : ''}` : c.target}${c.confident ? '' : '?'}`,
        )
        console.log(
          `[${s.sheetName}] ${s.kind} hdr=${s.headerRow + 1} products=${s.productRowCount} reqs=${s.requirements.length} warn=${s.warnings.join(',')}${verbose ? `\n   ${cols.join(' | ')}` : ''}`,
        )
        if (verbose)
          for (const r of s.requirements)
            console.log(`   REQ ${r.priority} [${r.category}] ${r.label} :: ${r.description.slice(0, 50)} ${r.condition ? JSON.stringify(r.condition) : ''}`)
      }
      for (const b of bundles) {
        const props = new Map(b.properties.map((p) => [p.id, p]))
        const linked = b.products.filter((p) => p.url).length
        const qualified = b.products.filter((p) => summarize(b.requirements, p, props).qualified).length
        console.log(
          `BUNDLE ${b.project.name} cat=${b.project.category} status=${b.project.status} products=${b.products.length} links=${linked} props=${b.properties.length} reqs=${b.requirements.length} conds=${b.requirements.filter((r) => r.condition).length} qualified=${qualified}`,
        )
      }
      expect(bundles.length).toBeGreaterThan(0)
    })
  }
})
