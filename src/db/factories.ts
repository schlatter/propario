import { newId, nowIso } from '../shared/ids.ts'
import type { Product, Project, PropertyDef, Requirement } from './types'

export function makeProject(p: Partial<Project> = {}): Project {
  const now = nowIso()
  return {
    id: newId(),
    name: '',
    category: '',
    status: 'research',
    description: '',
    notes: '',
    imageUrl: '',
    decisionProductId: null,
    budget: null,
    budgetPriority: 'must',
    budgetMin: null,
    budgetMinPriority: 'important',
    priceReference: '',
    tableView: { hiddenColumns: [], columnWidths: {}, hideExcluded: false },
    createdAt: now,
    updatedAt: now,
    ...p,
  }
}

export function makeProduct(projectId: string, p: Partial<Product> = {}): Product {
  const now = nowIso()
  return {
    id: newId(),
    projectId,
    brand: '',
    model: '',
    productType: '',
    price: null,
    priceNote: '',
    priceDate: '',
    gtin: '',
    mpn: '',
    offers: [],
    reviews: [],
    retailer: '',
    url: '',
    imageUrl: '',
    image: '',
    images: [],
    variant: '',
    description: '',
    comments: '',
    foundBy: '',
    candidate: 'open',
    favorite: false,
    favoriteRank: null,
    exclusionReason: '',
    exclusionCategory: '',
    ratings: [],
    votes: {},
    overall: '',
    pros: '',
    cons: '',
    notes: '',
    purchase: { status: 'none', date: '', price: null, retailer: '', note: '', returnUntil: '', warrantyUntil: '' },
    values: {},
    checks: {},
    links: [],
    extra: {},
    order: 0,
    createdAt: now,
    updatedAt: now,
    ...p,
  }
}

export function makeProperty(projectId: string, p: Partial<PropertyDef> = {}): PropertyDef {
  return {
    id: newId(),
    projectId,
    name: '',
    type: 'text',
    unit: '',
    options: [],
    better: '',
    order: 0,
    updatedAt: nowIso(),
    ...p,
  }
}

export function makeRequirement(projectId: string, r: Partial<Requirement> = {}): Requirement {
  return {
    id: newId(),
    projectId,
    category: '',
    label: '',
    description: '',
    priority: 'must',
    condition: null,
    order: 0,
    updatedAt: nowIso(),
    ...r,
  }
}

/** Fills in fields missing in older or hand-written records (used by backup restore). */
export function normalizeProduct(p: Partial<Product> & { id: string; projectId: string }): Product {
  const base = makeProduct(p.projectId)
  return {
    ...base,
    ...p,
    purchase: { ...base.purchase, ...(p.purchase ?? {}) },
    values: p.values ?? {},
    checks: p.checks ?? {},
    ratings: p.ratings ?? [],
    votes: p.votes ?? {},
    links: p.links ?? [],
    extra: p.extra ?? {},
    offers: p.offers ?? [],
    reviews: p.reviews ?? [],
  }
}

export function normalizeProject(p: Partial<Project> & { id: string }): Project {
  const base = makeProject()
  return { ...base, ...p, tableView: { ...base.tableView, ...(p.tableView ?? {}) } }
}
