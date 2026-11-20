import { existsSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { DEMO_PICTURE, demoChanges } from '../src/demo'
import type { Product, PropertyDef, Requirement } from '../src/db/types'

afterEach(() => localStorage.clear())

describe('the demo comparison', () => {
  it('holds together in both languages: three comparisons whose values, conditions and pictures point at what exists', () => {
    for (const locale of ['de', 'en']) {
      localStorage.setItem('pv.locale', locale)
      const changes = demoChanges()
      const records = (kind: string) => changes.flatMap((c) => (c.op === 'create' && c.kind === kind ? [c.record] : []))
      const props = new Set((records('properties') as PropertyDef[]).map((p) => p.id))
      const products = records('products') as Product[]
      const projects = records('projects')
      expect(projects).toHaveLength(3)
      expect(products).toHaveLength(16)
      // Each product, field and requirement belongs to one of the three.
      const ids = new Set(projects.map((p) => p.id))
      for (const r of [...products, ...records('properties'), ...records('requirements')] as { projectId: string }[]) expect(ids.has(r.projectId)).toBe(true)
      for (const p of products) {
        for (const key of Object.keys(p.values)) expect(props.has(key)).toBe(true)
        for (const pic of [p.image, ...(p.images ?? [])]) {
          expect(pic).toMatch(DEMO_PICTURE)
          expect(existsSync(`public${pic}`), pic).toBe(true)
        }
      }
      for (const r of records('requirements') as Requirement[]) {
        const target = r.condition?.target
        expect(target?.kind === 'property' && props.has(target.propertyId)).toBe(true)
      }
    }
  })
})
