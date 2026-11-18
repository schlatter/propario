/**
 * The records the server stores and the browser caches, and how changes to them are
 * described, merged and checked. Shared by both sides so they cannot disagree.
 *
 * A change either creates a record (`record`, complete) or patches one (`patch`, only the
 * fields that changed). Patches merge field by field, so two people editing different fields
 * of the same product do not overwrite each other. `values` and `checks` merge one level
 * deeper (per custom field / per requirement); `null` there removes the entry.
 */
import { makeProduct, makeProject, makeProperty, makeRequirement } from '../db/factories.ts'
import { EXCLUSION_CATEGORIES, type Product, type Project, type PropertyDef, type Requirement } from '../db/types.ts'
import { UUID } from './ids.ts'
import { SCALE_RANGE } from './review-scales.ts'

export const KINDS = ['projects', 'products', 'properties', 'requirements'] as const
export type Kind = (typeof KINDS)[number]

export type RecordOf<K extends Kind> = K extends 'projects' ? Project : K extends 'products' ? Product : K extends 'properties' ? PropertyDef : Requirement

export type AnyRecord = Project | Product | PropertyDef | Requirement

/** The project a record belongs to (a project belongs to itself). */
export const projectIdOf = (kind: Kind, r: { id: string; projectId?: string }) => (kind === 'projects' ? r.id : r.projectId!)

export type Change =
  | { op: 'create'; kind: Kind; record: AnyRecord }
  | { op: 'patch'; kind: Kind; id: string; projectId: string; patch: Record<string, unknown> }
  | { op: 'delete'; kind: Kind; id: string; projectId: string }

/** Fields merged per key instead of replaced as a whole. */
const DEEP = new Set(['values', 'checks', 'votes'])

export function applyPatch<T extends object>(record: T, patch: Record<string, unknown>): T {
  const next = { ...record } as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    if (DEEP.has(key) && value && typeof value === 'object' && !Array.isArray(value)) {
      const inner: Record<string, unknown> = { ...((next[key] as Record<string, unknown>) ?? {}) }
      for (const [k, v] of Object.entries(value)) {
        if (v === null) delete inner[k]
        else inner[k] = v
      }
      next[key] = inner
    } else next[key] = value
  }
  return next as T
}

// ---------- validation (used by the server on every write) ----------

const TEMPLATES: Record<Kind, Record<string, unknown>> = {
  projects: makeProject() as unknown as Record<string, unknown>,
  products: makeProduct('00000000-0000-4000-8000-000000000000') as unknown as Record<string, unknown>,
  properties: makeProperty('00000000-0000-4000-8000-000000000000') as unknown as Record<string, unknown>,
  requirements: makeRequirement('00000000-0000-4000-8000-000000000000') as unknown as Record<string, unknown>,
}

/** Fields that are null by default, with the type they have when set. */
const NULLABLE: Record<string, string> = { price: 'number', favoriteRank: 'number', decisionProductId: 'string', condition: 'object' }
const URL_FIELDS = new Set(['url', 'imageUrl'])
const MAX_STRING = 50_000
const MAX_JSON = 512 * 1024

export const IMAGE_PATH = /^\/api\/images\/[0-9a-f-]{36}$/

/** Shapes of the list entries inside a product: field → type ('number?' = number or null). */
const ITEM_SHAPES: Record<string, Record<string, string>> = {
  offers: { id: 'string', shop: 'string', price: 'number?', shipping: 'number?', date: 'string', url: 'string' },
  reviews: { id: 'string', source: 'string', about: 'string', value: 'number?', scale: 'string', count: 'number?', date: 'string', url: 'string' },
}
const MAX_ITEMS = 50
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Checks the entries of `offers` or `reviews`: exactly the known fields, right types, sane values. */
function checkItems(key: string, list: unknown[]): string | null {
  const shape = ITEM_SHAPES[key]
  if (list.length > MAX_ITEMS) return `${key}: at most ${MAX_ITEMS} entries`
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return `${key}: entries must be objects`
    const it = item as Record<string, unknown>
    if (Object.keys(it).length !== Object.keys(shape).length) return `${key}: unexpected fields`
    for (const [f, type] of Object.entries(shape)) {
      const v = it[f]
      const ok = type === 'number?' ? v === null || (typeof v === 'number' && Number.isFinite(v)) : typeof v === type
      if (!ok) return `${key}.${f} must be ${type === 'number?' ? 'a number or null' : type}`
      if (typeof v === 'string' && v.length > 500) return `${key}.${f} is too long`
    }
    if (!UUID.test(String(it.id))) return `${key}.id must be a UUID`
    if (it.url !== '' && !/^https?:\/\//i.test(String(it.url))) return `${key}.url must be an http(s) link`
    if (it.date !== '' && !ISO_DATE.test(String(it.date))) return `${key}.date must be yyyy-mm-dd`
    if (key === 'offers' && ((it.price as number) < 0 || (it.shipping as number) < 0)) return 'offers: prices cannot be negative'
    if (key === 'reviews') {
      if (!Object.hasOwn(SCALE_RANGE, String(it.scale))) return 'reviews.scale is unknown'
      if (it.about !== 'product' && it.about !== 'shop') return 'reviews.about must be product or shop'
      if (it.count !== null && (!Number.isInteger(it.count) || (it.count as number) < 0)) return 'reviews.count must be a whole number'
    }
  }
  return null
}

function kindOfValue(v: unknown) {
  return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v
}

function checkStrings(v: unknown, depth = 0): boolean {
  if (depth > 6) return false
  if (typeof v === 'string') return v.length <= MAX_STRING
  if (Array.isArray(v)) return v.length <= 5000 && v.every((x) => checkStrings(x, depth + 1))
  if (v && typeof v === 'object') return Object.entries(v).every(([k, x]) => k.length <= 500 && checkStrings(x, depth + 1))
  return typeof v !== 'function'
}

/**
 * Checks fields against the shape of a fresh record: only known fields, each with the same JSON
 * type as its default, ids are UUIDs, links are http(s), images point to this server.
 * Returns an error text or null.
 */
export function checkFields(kind: Kind, fields: Record<string, unknown>): string | null {
  const template = TEMPLATES[kind]
  for (const [key, value] of Object.entries(fields)) {
    if (!(key in template)) return `unknown field ${key}`
    const expected = NULLABLE[key] ?? kindOfValue(template[key])
    const actual = kindOfValue(value)
    if (actual !== expected && !(key in NULLABLE && actual === 'null')) return `field ${key} must be ${expected}`
    if (actual === 'number' && !Number.isFinite(value)) return `field ${key} must be a finite number`
    if ((key === 'id' || key === 'projectId') && !UUID.test(String(value))) return `field ${key} must be a UUID`
    if (URL_FIELDS.has(key) && value !== '' && !/^https?:\/\//i.test(String(value))) return `field ${key} must be an http(s) link`
    if (key === 'image' && value !== '' && !IMAGE_PATH.test(String(value))) return 'field image must point to this server'
    if (key === 'exclusionCategory' && value !== '' && !(EXCLUSION_CATEGORIES as unknown[]).includes(value)) return 'field exclusionCategory is unknown'
    if (key === 'gtin' && value !== '' && !/^\d{1,14}$/.test(String(value))) return 'field gtin must be up to 14 digits'
    if (key === 'mpn' && String(value).length > 64) return 'field mpn is too long'
    if (key === 'priceDate' && value !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return 'field priceDate must be yyyy-mm-dd'
    if (key === 'links' && !(value as unknown[]).every((l) => typeof l === 'string' && /^https?:\/\//i.test(l))) return 'links must be http(s)'
    if (key in ITEM_SHAPES) {
      const err = checkItems(key, value as unknown[])
      if (err) return err
    }
    if (key === 'purchase') {
      for (const d of ['returnUntil', 'warrantyUntil']) {
        const v = (value as Record<string, unknown>)[d]
        if (v !== undefined && (typeof v !== 'string' || (v !== '' && !ISO_DATE.test(v)))) return `purchase.${d} must be yyyy-mm-dd`
      }
    }
    if (key === 'votes' && !Object.entries(value as object).every(([k, v]) => UUID.test(k) && (v === 'like' || v === 'dislike')))
      return 'votes must be like or dislike per account'
    if (!checkStrings(value)) return `field ${key} is too large or too deep`
  }
  if (JSON.stringify(fields).length > MAX_JSON) return 'record too large'
  return null
}

/** Structural check of one change as it arrives from a client. */
export function checkChange(c: unknown): string | null {
  if (!c || typeof c !== 'object') return 'change must be an object'
  const ch = c as Record<string, unknown>
  if (!KINDS.includes(ch.kind as Kind)) return 'unknown kind'
  const kind = ch.kind as Kind
  if (ch.op === 'create') {
    const r = ch.record as Record<string, unknown> | undefined
    if (!r || typeof r !== 'object' || Array.isArray(r)) return 'record must be an object'
    if (typeof r.id !== 'string') return 'record needs an id'
    if (kind !== 'projects' && typeof r.projectId !== 'string') return 'record needs a projectId'
    return checkFields(kind, r)
  }
  if (ch.op === 'patch' || ch.op === 'delete') {
    if (typeof ch.id !== 'string' || !UUID.test(ch.id)) return 'id must be a UUID'
    if (typeof ch.projectId !== 'string' || !UUID.test(ch.projectId)) return 'projectId must be a UUID'
    if (ch.op === 'patch') {
      const patch = ch.patch as Record<string, unknown> | undefined
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return 'patch must be an object'
      if ('id' in patch || 'projectId' in patch) return 'id and projectId cannot change'
      // values/checks patches may carry null to remove an entry.
      const plain = { ...patch }
      for (const key of DEEP) if (key in plain) plain[key] = Object.fromEntries(Object.entries((plain[key] as object) ?? {}).filter(([, v]) => v !== null))
      return checkFields(kind, plain)
    }
    return null
  }
  return 'unknown op'
}

/**
 * Makes a record from an import or an old backup acceptable to checkFields without losing
 * anything: links that are not http(s) move to `extra` (products) or are dropped from `links`
 * only when they are not links at all.
 */
export function sanitize<T extends AnyRecord>(kind: Kind, record: T): T {
  const r = { ...record } as Record<string, unknown>
  const extra = { ...((r.extra as Record<string, string>) ?? {}) }
  for (const key of URL_FIELDS) {
    if (typeof r[key] === 'string' && r[key] !== '' && !/^https?:\/\//i.test(r[key] as string)) {
      if (kind === 'products') extra[key] = r[key] as string
      r[key] = ''
    }
  }
  if (Array.isArray(r.links)) r.links = (r.links as unknown[]).filter((l) => typeof l === 'string' && /^https?:\/\//i.test(l))
  if (typeof r.image === 'string' && r.image !== '' && !IMAGE_PATH.test(r.image)) r.image = ''
  if (kind === 'products') r.extra = extra
  return r as T
}
