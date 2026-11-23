/**
 * Demo mode: Propario with an invented comparison, entirely in this browser tab. Everything can
 * be tried – editing, filtering, comparing, deciding – but nothing reaches the server: changes
 * go to a transport that only applies them locally, other server calls are refused, and the demo
 * data lives in its own browser database that is removed when the demo ends. It ends with the
 * tab, too (the switch is kept in sessionStorage).
 */
import Dexie from 'dexie'
import { makeProduct, makeProject, makeProperty, makeRequirement } from './db/factories'
import type { Product, Project, PropertyDef, Requirement } from './db/types'
import { initialLocale } from './i18n/active'
import type { Change } from './shared/records.ts'
import type { SyncResult, Transport } from './sync'
import { db } from './db/db'
import { todayIso, shiftDate } from './domain/values'
import { asset, BASE, DEMO_ONLY } from './site'

const FLAG = 'propario-demo'
export const DEMO_DB = 'propario-demo'
export const DEMO_USER = { id: 'demo', name: 'Ada', isAdmin: false, settings: { people: ['Ada', 'Grace'] } }
/** Pictures that come with the app for the demo (public/demo). */
export const DEMO_PICTURE = new RegExp(`^${BASE.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}demo/[a-z0-9-]+\\.svg$`)
const RESTART = 'propario-demo-restart'
/** One of the drawings that come with the demo (public/demo). */
const pic = (name: string) => asset(`demo/${name}.svg`)

export function isDemo(): boolean {
  try {
    return DEMO_ONLY || sessionStorage.getItem(FLAG) === '1'
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
  location.assign(BASE)
}

/** Leaves the demo; the next start removes its data (this page still holds it open). On the
 * website, where the demo is all there is, it starts over with the invented comparisons. */
export function endDemo() {
  try {
    if (DEMO_ONLY) sessionStorage.setItem(RESTART, '1')
    else sessionStorage.removeItem(FLAG)
  } catch {
    /* nothing to remove */
  }
  location.assign(BASE)
}

/** On the website: what "Start over" asked for – the demo's data removed before it opens. */
export async function restartIfAsked() {
  try {
    if (sessionStorage.getItem(RESTART) !== '1') return
    sessionStorage.removeItem(RESTART)
  } catch {
    return
  }
  await Dexie.delete(DEMO_DB).catch(() => {})
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

type T = (deText: string, enText: string) => string

/**
 * The invented comparisons, in the interface language: a sideboard for the living room,
 * headphones for the commute and a robot vacuum for the ground floor – three kinds of decision,
 * each with its fields, requirements, verdicts and pictures (drawn by scripts/demo-pictures.ts).
 */
export function demoChanges(): Change[] {
  const de = initialLocale() === 'de'
  const t: T = (deText, enText) => (de ? deText : enText)
  return [...sideboards(t), ...headphones(t), ...vacuums(t)]
}

/** Creates for one comparison: the project first, then its fields, requirements and products. */
const creates = (project: Project, properties: PropertyDef[], requirements: Requirement[], products: Product[]): Change[] => [
  { op: 'create', kind: 'projects', record: project },
  ...properties.map((record): Change => ({ op: 'create', kind: 'properties', record })),
  ...requirements.map((record): Change => ({ op: 'create', kind: 'requirements', record })),
  ...products.map((record): Change => ({ op: 'create', kind: 'products', record })),
]

const days = (n: number) => shiftDate(todayIso(), { days: -n })

function sideboards(t: T): Change[] {
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
        image: pic('sideboard-arvika'),
        images: [pic('sideboard-arvika-dims')],
        candidate: 'checked',
        favorite: true,
        votes: { demo: 'like', grace: 'like' },
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
        image: pic('sideboard-bo'),
        pros: t('Schöne Maserung', 'Beautiful grain'),
        candidate: 'checked',
        votes: { demo: 'neutral', grace: 'dislike' },
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
        image: pic('sideboard-kanto'),
        favorites: { grace: true },
        votes: { grace: 'like' },
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
        image: pic('sideboard-mira'),
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
        image: pic('sideboard-arvika-low'),
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
        image: pic('sideboard-linea'),
        votes: { demo: 'like', grace: 'like' },
      },
      [170, 72, 38, veneer, true, null],
      5,
    ),
  ]
  return creates(project, properties, requirements, products)
}

function headphones(t: T): Change[] {
  const project = makeProject({
    name: t('Kopfhörer fürs Pendeln', 'Headphones for the commute'),
    category: t('Technik', 'Tech'),
    status: 'comparing',
    description: t(
      'Für Zug und Büro: gute Geräuschunterdrückung, ein langer Akku, leicht genug für den ganzen Tag.',
      'For train and office: good noise cancelling, a long battery, light enough for a whole day.',
    ),
    budget: 350,
    budgetPriority: 'must',
  })
  const pid = project.id
  const prop = (name: string, p: Parameters<typeof makeProperty>[1]) => makeProperty(pid, { name, ...p })
  const battery = prop(t('Akkulaufzeit', 'Battery life'), { type: 'number', unit: 'h', better: 'higher', order: 0 })
  const weight = prop(t('Gewicht', 'Weight'), { type: 'number', unit: 'g', better: 'lower', order: 1 })
  const anc = prop(t('Geräuschunterdrückung', 'Noise cancelling'), { type: 'boolean', order: 2 })
  const codec = prop('Codec', { type: 'select', order: 3, options: ['AAC', 'aptX Adaptive', 'LDAC'] })
  const foldable = prop(t('Faltbar', 'Foldable'), { type: 'boolean', order: 4 })
  const properties = [battery, weight, anc, codec, foldable]
  const req = (label: string, p: Parameters<typeof makeRequirement>[1]) => makeRequirement(pid, { label, ...p })
  const requirements = [
    req(t('Hält den Zug draußen', 'Shuts out the train'), {
      category: t('Klang', 'Sound'),
      priority: 'must',
      order: 0,
      condition: { target: { kind: 'property', propertyId: anc.id }, op: 'isTrue' },
    }),
    req(t('Hält die Woche durch', 'Lasts the week'), {
      category: 'Akku',
      priority: 'important',
      order: 1,
      condition: { target: { kind: 'property', propertyId: battery.id }, op: 'gte', value: 30 },
    }),
    req(t('Leicht genug für den Tag', 'Light enough for the day'), {
      category: t('Komfort', 'Comfort'),
      priority: 'wish',
      order: 2,
      condition: { target: { kind: 'property', propertyId: weight.id }, op: 'lte', value: 260 },
    }),
  ]
  const product = (p: Partial<Product>, v: [number, number, boolean, string, boolean], order: number) =>
    makeProduct(pid, {
      productType: t('Kopfhörer', 'Headphones'),
      ...p,
      priceDate: days(order + 2),
      foundBy: order % 2 ? 'Ada' : 'Grace',
      order,
      values: { [battery.id]: v[0], [weight.id]: v[1], [anc.id]: v[2], [codec.id]: v[3], [foldable.id]: v[4] },
    })
  const [aac, aptx, ldac] = codec.options
  const products = [
    product(
      {
        brand: 'Sonora',
        model: 'Aura 4',
        price: 329,
        retailer: 'Klangraum',
        url: 'https://shop.example/sonora-aura-4',
        image: pic('headphones-aura'),
        candidate: 'checked',
        favorite: true,
        votes: { demo: 'like', grace: 'like' },
        pros: t('Beste Geräuschunterdrückung im Test', 'Best noise cancelling in the test'),
        reviews: [{ id: 'h1', source: 'Stiftung Warentest', about: 'product', value: 1.7, scale: 'grade', count: null, date: days(30), url: '' }],
      },
      [30, 250, true, ldac, true],
      0,
    ),
    product(
      {
        brand: 'Kestrel',
        model: 'Q35',
        price: 279,
        retailer: 'Technikhaus',
        url: 'https://shop.example/kestrel-q35',
        image: pic('headphones-kestrel'),
        candidate: 'checked',
        votes: { demo: 'like', grace: 'like' },
        pros: t('40 Stunden Akku', '40 hours of battery'),
      },
      [40, 265, true, aptx, true],
      1,
    ),
    product(
      {
        brand: 'Ondo',
        model: 'Studio Pro',
        price: 399,
        retailer: 'Klangraum',
        url: 'https://shop.example/ondo-studio-pro',
        image: pic('headphones-ondo'),
        cons: t('Schwer und über dem Budget', 'Heavy and over budget'),
      },
      [24, 310, true, ldac, false],
      2,
    ),
    product(
      {
        brand: 'Lumen',
        model: 'Air',
        price: 149,
        retailer: 'Technikhaus',
        url: 'https://shop.example/lumen-air',
        image: pic('headphones-lumen'),
        candidate: 'excluded',
        exclusionCategory: 'quality',
        exclusionReason: t('Keine Geräuschunterdrückung', 'No noise cancelling'),
      },
      [60, 230, false, aac, true],
      3,
    ),
    product(
      {
        brand: 'Halden',
        model: 'H7',
        price: 349,
        retailer: 'Klangraum',
        url: 'https://shop.example/halden-h7',
        image: pic('headphones-halden'),
        votes: { grace: 'like' },
        favorites: { grace: true },
      },
      [35, 254, true, aac, true],
      4,
    ),
  ]
  return creates(project, properties, requirements, products)
}

function vacuums(t: T): Change[] {
  const project = makeProject({
    name: t('Saugroboter fürs Erdgeschoss', 'Robot vacuum for the ground floor'),
    category: t('Haushalt', 'Household'),
    status: 'research',
    description: t(
      'Muss unters Sofa passen (9,5 cm) und sich selbst leeren; leise genug für abends.',
      'Has to fit under the sofa (9.5 cm) and empty itself; quiet enough for the evening.',
    ),
    budget: 700,
    budgetPriority: 'important',
  })
  const pid = project.id
  const prop = (name: string, p: Parameters<typeof makeProperty>[1]) => makeProperty(pid, { name, ...p })
  const height = prop(t('Höhe', 'Height'), { type: 'number', unit: 'cm', better: 'lower', order: 0 })
  const suction = prop(t('Saugkraft', 'Suction'), { type: 'number', unit: 'Pa', better: 'higher', order: 1 })
  const noise = prop(t('Lautstärke', 'Noise'), { type: 'number', unit: 'dB', better: 'lower', order: 2 })
  const station = prop(t('Absaugstation', 'Self-emptying'), { type: 'boolean', order: 3 })
  const mop = prop(t('Wischt', 'Mops'), { type: 'boolean', order: 4 })
  const properties = [height, suction, noise, station, mop]
  const req = (label: string, p: Parameters<typeof makeRequirement>[1]) => makeRequirement(pid, { label, ...p })
  const requirements = [
    req(t('Passt unters Sofa', 'Fits under the sofa'), {
      category: t('Maße', 'Size'),
      priority: 'must',
      order: 0,
      condition: { target: { kind: 'property', propertyId: height.id }, op: 'lte', value: 9.5 },
    }),
    req(t('Leert sich selbst', 'Empties itself'), {
      category: t('Komfort', 'Comfort'),
      priority: 'important',
      order: 1,
      condition: { target: { kind: 'property', propertyId: station.id }, op: 'isTrue' },
    }),
    req(t('Leise genug für abends', 'Quiet enough for the evening'), {
      category: t('Komfort', 'Comfort'),
      priority: 'wish',
      order: 2,
      condition: { target: { kind: 'property', propertyId: noise.id }, op: 'lte', value: 65 },
    }),
  ]
  const product = (p: Partial<Product>, v: [number, number, number, boolean, boolean], order: number) =>
    makeProduct(pid, {
      productType: t('Saugroboter', 'Robot vacuum'),
      ...p,
      priceDate: days(order + 1),
      foundBy: order % 2 ? 'Grace' : 'Ada',
      order,
      values: { [height.id]: v[0], [suction.id]: v[1], [noise.id]: v[2], [station.id]: v[3], [mop.id]: v[4] },
    })
  const products = [
    product(
      {
        brand: 'Tidy',
        model: 'T9 Max',
        price: 649,
        retailer: 'Haushaltsprofi',
        url: 'https://shop.example/tidy-t9-max',
        image: pic('vacuum-tidy'),
        images: [pic('vacuum-tidy-dims')],
        votes: { demo: 'like', grace: 'like' },
      },
      [9.2, 6000, 63, true, true],
      0,
    ),
    product(
      {
        brand: 'Robin',
        model: 'S8',
        price: 549,
        retailer: 'Technikhaus',
        url: 'https://shop.example/robin-s8',
        image: pic('vacuum-robin'),
        votes: { demo: 'like', grace: 'like' },
      },
      [9.6, 5000, 66, true, false],
      1,
    ),
    product(
      {
        brand: 'Nimbus',
        model: 'X2 Omni',
        price: 899,
        retailer: 'Haushaltsprofi',
        url: 'https://shop.example/nimbus-x2-omni',
        image: pic('vacuum-nimbus'),
        favorites: { demo: true },
      },
      [8.1, 8000, 60, true, true],
      2,
    ),
    product(
      { brand: 'Pebble', model: 'Lite', price: 249, retailer: 'Technikhaus', url: 'https://shop.example/pebble-lite', image: pic('vacuum-pebble') },
      [7.8, 2700, 68, false, false],
      3,
    ),
    product(
      { brand: 'Orbit', model: '30', price: 449, retailer: 'Haushaltsprofi', url: 'https://shop.example/orbit-30', image: pic('vacuum-orbit') },
      [10.3, 5500, 64, true, false],
      4,
    ),
  ]
  return creates(project, properties, requirements, products)
}
