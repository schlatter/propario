/**
 * Demo mode: Propario with an invented comparison, entirely in this browser tab. Everything can
 * be tried – editing, filtering, comparing, deciding – but nothing reaches the server: changes
 * go to a transport that only applies them locally, other server calls are refused, and the demo
 * data lives in its own browser database that is removed when the demo ends. It ends with the
 * tab, too (the switch is kept in sessionStorage).
 */
import Dexie from 'dexie'
import { makeProduct, makeProject, makeProperty, makeRequirement } from './db/factories'
import type { Product } from './db/types'
import { initialLocale } from './i18n/active'
import type { Change } from './shared/records.ts'
import type { SyncResult, Transport } from './sync'
import { db } from './db/db'
import { todayIso, shiftDate } from './domain/values'

const FLAG = 'propario-demo'
export const DEMO_DB = 'propario-demo'
export const DEMO_USER = { id: 'demo', name: 'Ada', isAdmin: false, settings: { people: ['Ada', 'Grace'] } }
/** Pictures that come with the app for the demo (public/demo). */
export const DEMO_PICTURE = /^\/demo\/[a-z0-9-]+\.svg$/

export function isDemo(): boolean {
  try {
    return sessionStorage.getItem(FLAG) === '1'
  } catch {
    return false
  }
}

export function startDemo() {
  try {
    sessionStorage.setItem(FLAG, '1')
  } catch {
    return
  }
  location.assign('/')
}

/** Leaves the demo; the next start removes its data (this page still holds it open). */
export function endDemo() {
  try {
    sessionStorage.removeItem(FLAG)
  } catch {
    /* nothing to remove */
  }
  location.assign('/')
}

/** Removes what a demo left in this browser; runs on every start outside the demo. */
export function clearDemo() {
  void Dexie.delete(DEMO_DB).catch(() => {})
}

/** Changes stay in this tab; "pulling" just confirms what is here. */
export const demoTransport: Transport = {
  async push() {},
  async pull(): Promise<SyncResult> {
    const projects = await db.projects.toArray()
    return { seq: 1, full: false, projects: projects.map((p) => ({ id: p.id, role: 'owner' })), records: [], deleted: [] }
  },
}

/** The invented comparison, in the interface language: a sideboard for the living room. */
export function demoChanges(): Change[] {
  const de = initialLocale() === 'de'
  const t = (deText: string, enText: string) => (de ? deText : enText)
  const today = todayIso()
  const project = makeProject({
    name: t('Sideboard fürs Wohnzimmer', 'Living-room sideboard'),
    category: t('Möbel', 'Furniture'),
    status: 'comparing',
    description: t(
      'Für die Nische neben dem Fenster: höchstens 180 cm breit, nicht zu tief.',
      'For the niche by the window: at most 180 cm wide, not too deep.',
    ),
    budget: 900,
    budgetPriority: 'must',
  })
  const pid = project.id
  const prop = (name: string, p: Parameters<typeof makeProperty>[1]) => makeProperty(pid, { name, ...p })
  const width = prop(t('Breite', 'Width'), { type: 'number', unit: 'cm', order: 0 })
  const height = prop(t('Höhe', 'Height'), { type: 'number', unit: 'cm', order: 1 })
  const depth = prop(t('Tiefe', 'Depth'), { type: 'number', unit: 'cm', better: 'lower', order: 2 })
  const material = prop('Material', {
    type: 'select',
    order: 3,
    options: [
      t('Eiche massiv', 'Solid oak'),
      t('Nussbaum furniert', 'Walnut veneer'),
      t('Lack weiß', 'White lacquer'),
      t('Kiefer', 'Pine'),
      t('Eiche furniert', 'Oak veneer'),
    ],
  })
  const [oak, walnut, white, pine, veneer] = material.options
  const softClose = prop('Soft-Close', { type: 'boolean', order: 4 })
  const delivery = prop(t('Lieferzeit', 'Delivery'), { type: 'number', unit: t('Wochen', 'weeks'), better: 'lower', order: 5 })
  const properties = [width, height, depth, material, softClose, delivery]

  const req = (label: string, p: Parameters<typeof makeRequirement>[1]) => makeRequirement(pid, { label, ...p })
  const requirements = [
    req(t('Passt in die Nische', 'Fits the niche'), {
      category: t('Maße', 'Size'),
      priority: 'must',
      order: 0,
      condition: { target: { kind: 'property', propertyId: width.id }, op: 'lte', value: 180 },
    }),
    req(t('Nicht zu tief', 'Not too deep'), {
      category: t('Maße', 'Size'),
      priority: 'important',
      order: 1,
      condition: { target: { kind: 'property', propertyId: depth.id }, op: 'lte', value: 45 },
    }),
    req(t('Türen schließen leise', 'Doors close quietly'), {
      category: t('Komfort', 'Comfort'),
      priority: 'wish',
      order: 2,
      condition: { target: { kind: 'property', propertyId: softClose.id }, op: 'isTrue' },
    }),
    req(t('Schnell lieferbar', 'Delivered soon'), {
      category: t('Kauf', 'Purchase'),
      priority: 'wish',
      order: 3,
      condition: { target: { kind: 'property', propertyId: delivery.id }, op: 'lte', value: 6 },
    }),
  ]

  const days = (n: number) => shiftDate(today, { days: -n })
  const product = (p: Partial<Product>, v: [number, number, number, string, boolean | null, number | null], order: number) =>
    makeProduct(pid, {
      ...p,
      priceDate: days(order + 1),
      foundBy: order % 2 ? 'Grace' : 'Ada',
      order,
      values: Object.fromEntries(
        (
          [
            [width.id, v[0]],
            [height.id, v[1]],
            [depth.id, v[2]],
            [material.id, v[3]],
            [softClose.id, v[4]],
            [delivery.id, v[5]],
          ] as const
        ).filter(([, x]) => x !== null),
      ),
    })
  const products = [
    product(
      {
        brand: 'Nordhaus',
        model: 'Arvika',
        productType: 'Sideboard',
        price: 849,
        retailer: 'Wohnwerk',
        url: 'https://shop.example/nordhaus-arvika',
        image: '/demo/sideboard-arvika.svg',
        images: ['/demo/sideboard-arvika-dims.svg'],
        candidate: 'checked',
        favorite: true,
        votes: { demo: 'like' },
        pros: t('Massivholz, leise Türen', 'Solid wood, quiet doors'),
        cons: t('Lieferzeit 4 Wochen', 'Four weeks to deliver'),
        reviews: [
          { id: 'r1', source: 'Stiftung Warentest', about: 'product', value: 1.8, scale: 'grade', count: null, date: days(40), url: '' },
          { id: 'r2', source: 'Wohnwerk', about: 'product', value: 4.6, scale: 'stars5', count: 212, date: days(3), url: '' },
        ],
      },
      [160, 80, 42, oak, true, 4],
      0,
    ),
    product(
      {
        brand: 'Lund & Co',
        model: 'Bo',
        productType: 'Sideboard',
        price: 1090,
        retailer: 'Holzladen',
        url: 'https://shop.example/lund-bo',
        image: '/demo/sideboard-bo.svg',
        pros: t('Schöne Maserung', 'Beautiful grain'),
        candidate: 'checked',
        votes: { demo: 'neutral' },
      },
      [180, 75, 45, walnut, true, 6],
      1,
    ),
    product(
      {
        brand: 'Fjell',
        model: 'Kanto',
        productType: 'Sideboard',
        price: 549,
        retailer: 'Wohnwerk',
        url: 'https://shop.example/fjell-kanto',
        image: '/demo/sideboard-kanto.svg',
      },
      [150, 85, 40, white, false, 2],
      2,
    ),
    product(
      {
        brand: 'Haller',
        model: 'Mira',
        productType: 'Sideboard',
        price: 699,
        retailer: 'Holzladen',
        url: 'https://shop.example/haller-mira',
        image: '/demo/sideboard-mira.svg',
        candidate: 'excluded',
        exclusionCategory: 'size',
        exclusionReason: t('Zu breit für die Nische', 'Too wide for the niche'),
      },
      [200, 78, 40, pine, false, 3],
      3,
    ),
    product(
      {
        brand: 'Nordhaus',
        model: 'Arvika Low',
        productType: 'Lowboard',
        price: 899,
        retailer: 'Nordhaus Store',
        url: 'https://shop.example/nordhaus-arvika-low',
        image: '/demo/sideboard-arvika-low.svg',
      },
      [180, 60, 42, oak, true, 8],
      4,
    ),
    product(
      {
        brand: 'Studio Verde',
        model: 'Linea',
        productType: 'Sideboard',
        price: 779,
        retailer: 'Wohnwerk',
        url: 'https://shop.example/studio-verde-linea',
        image: '/demo/sideboard-linea.svg',
      },
      [170, 72, 38, veneer, true, null],
      5,
    ),
  ]
  return [
    { op: 'create', kind: 'projects', record: project },
    ...properties.map((record): Change => ({ op: 'create', kind: 'properties', record })),
    ...requirements.map((record): Change => ({ op: 'create', kind: 'requirements', record })),
    ...products.map((record): Change => ({ op: 'create', kind: 'products', record })),
  ]
}
