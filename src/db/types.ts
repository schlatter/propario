/**
 * Domain model. Every record carries a UUID and `updatedAt` so a later
 * multi-device sync can merge records without changing the shape.
 */

export const SCHEMA_VERSION = 1

export type ProjectStatus = 'research' | 'comparing' | 'decided' | 'purchased' | 'archived'
export const PROJECT_STATUSES: ProjectStatus[] = ['research', 'comparing', 'decided', 'purchased', 'archived']

export type PropertyType = 'text' | 'number' | 'boolean' | 'date' | 'select' | 'rating' | 'url'
export const PROPERTY_TYPES: PropertyType[] = ['text', 'number', 'boolean', 'date', 'select', 'rating', 'url']

/** Stored value of a custom property. Dates are ISO `yyyy-mm-dd` strings. */
export type PropertyValue = string | number | boolean | null

/**
 * Where a product stands: not looked at yet, looked at, or out. 'favorite' is how records from
 * before 0.12 marked a favourite; read it with `statusOf` / `isFavorite` (src/domain/verdict.ts).
 */
export type Candidate = 'open' | 'checked' | 'excluded' | 'favorite'
export type Status = 'open' | 'checked' | 'excluded'
export const STATUSES: Status[] = ['open', 'checked', 'excluded']

/** Each person's verdict on a product: thumbs up, neutral, thumbs down. */
export type Vote = 'like' | 'neutral' | 'dislike'
export const VOTES: Vote[] = ['like', 'neutral', 'dislike']

/** Why a product was excluded, as a choice (filterable); details go into `exclusionReason`. */
export type ExclusionCategory = 'looks' | 'size' | 'price' | 'brand' | 'shop' | 'quality' | 'reviews' | 'other'
export const EXCLUSION_CATEGORIES: ExclusionCategory[] = ['looks', 'size', 'price', 'brand', 'shop', 'quality', 'reviews', 'other']

export type PurchaseStatus = 'none' | 'ordered' | 'purchased'

export type Priority = 'must' | 'important' | 'wish' | 'bonus' | 'exclusion' | 'avoid' | 'info'
export const PRIORITIES: Priority[] = ['must', 'important', 'wish', 'bonus', 'exclusion', 'avoid', 'info']

export type ConditionOp = 'lte' | 'lt' | 'gte' | 'gt' | 'eq' | 'neq' | 'contains' | 'isTrue' | 'isFalse'

/** Target of a requirement condition: a custom property id or a built-in field. */
export type ConditionTarget = { kind: 'property'; propertyId: string } | { kind: 'price' }

export interface Condition {
  target: ConditionTarget
  op: ConditionOp
  value?: string | number
}

export interface TableView {
  hiddenColumns: string[]
  columnWidths: Record<string, number>
  /** Column ids in the order chosen by dragging; columns not listed keep their default place at the end. */
  columnOrder?: string[]
  sort?: { column: string; dir: 'asc' | 'desc' }
  hideExcluded: boolean
}

export interface Project {
  id: string
  name: string
  category: string
  status: ProjectStatus
  description: string
  /** Free notes, e.g. "current system", reference links, sections imported from Excel. */
  notes: string
  imageUrl: string
  decisionProductId: string | null
  /** Most the price may be (null = no budget). Absent before 0.5. */
  budget?: number | null
  /** How the maximum counts; must unless chosen otherwise. Absent before 0.7. */
  budgetPriority?: Priority
  /** Least the price should be (null = none). Absent before 0.7. */
  budgetMin?: number | null
  /** How the minimum counts; important unless chosen otherwise. Absent before 0.7. */
  budgetMinPriority?: Priority
  /** Product whose price the others are measured against ('' = budget or cheapest). Absent before 0.5. */
  priceReference?: string
  /** Each person's ranking from duels, keyed by account (src/domain/duel.ts). Absent before 0.14. */
  rankings?: Record<string, Ranking>
  tableView: TableView
  createdAt: string
  updatedAt: string
}

/**
 * One person's ranking: products best first. The first `settled` places are decided; the
 * product at `settled` holds its place until `next` (and every product after it) was compared
 * with it. See src/domain/duel.ts.
 */
export interface Ranking {
  order: string[]
  settled: number
  next: number
}

export interface PropertyDef {
  id: string
  projectId: string
  name: string
  type: PropertyType
  unit: string
  /** Choices for `select`. */
  options: string[]
  /** For numbers: which way is better when comparing ('' = no judgement). Absent before 0.5. */
  better?: '' | 'lower' | 'higher'
  order: number
  updatedAt: string
}

export interface Rating {
  person: string
  /** 1–5, or null when only a note was given. */
  stars: number | null
  note: string
}

export interface Purchase {
  status: PurchaseStatus
  date: string
  price: number | null
  retailer: string
  note: string
  /** Last day to send it back, ISO date ('' when unknown). Absent in records from before 0.3. */
  returnUntil?: string
  /** End of the statutory warranty or a manufacturer guarantee, ISO date. Absent before 0.3. */
  warrantyUntil?: string
}

/** One shop's offer for a product. The cheapest total (price + shipping) becomes the product's price. */
export interface Offer {
  id: string
  shop: string
  price: number | null
  shipping: number | null
  /** When the offer was seen, ISO date. */
  date: string
  url: string
}

/** How a source rates: 1–5 stars (higher is better), a German school grade 0.5–5.5 (lower is better), or 0–100 %. */
export type ReviewScale = 'stars5' | 'grade' | 'percent'
export const REVIEW_SCALES: ReviewScale[] = ['stars5', 'grade', 'percent']

/** A rating from a source outside Propario, entered by hand (Stiftung Warentest, Amazon, Trustpilot …). */
export interface Review {
  id: string
  source: string
  /** Product reviews and shop reviews are shown apart and never averaged together. */
  about: 'product' | 'shop'
  value: number | null
  scale: ReviewScale
  /** Number of reviews behind the value, when the source says. */
  count: number | null
  date: string
  url: string
}

export interface Product {
  id: string
  projectId: string
  brand: string
  model: string
  productType: string
  price: number | null
  /** Original price text when it could not be read as one number, e.g. "830 – 900 €". */
  priceNote: string
  /** When the price was last set, ISO `yyyy-mm-dd` ('' when unknown, e.g. imported). */
  priceDate: string
  /** GTIN/EAN, digits only ('' when unknown). Identifies the product for price and test searches. */
  gtin: string
  /** Manufacturer part number ('' when unknown). */
  mpn: string
  /** Offers from several shops. Absent in records from before 0.3 – read with `?? []`. */
  offers: Offer[]
  /** Ratings from outside sources. Absent in records from before 0.3 – read with `?? []`. */
  reviews: Review[]
  retailer: string
  url: string
  imageUrl: string
  /** Downloaded product image, shrunk, as a data URL ('' when none). See src/images.ts. */
  image: string
  /** Further pictures (a dimension drawing, another view), stored like `image`. Absent before 0.8. */
  images?: string[]
  variant: string
  description: string
  comments: string
  foundBy: string
  candidate: Candidate
  /** A star from before stars were personal (0.12–0.13): counts for everyone who has not chosen yet. */
  favorite?: boolean
  /** Each person's own star, keyed by account; false = taken back. Absent before 0.14. */
  favorites?: Record<string, boolean>
  favoriteRank: number | null
  exclusionReason: string
  /** Kind of reason ('' when none chosen). Absent in records from before 0.3. */
  exclusionCategory?: ExclusionCategory | ''
  ratings: Rating[]
  /** Swipe mode: each account's quick verdict, keyed by account id. */
  votes: Record<string, Vote>
  overall: string
  pros: string
  cons: string
  notes: string
  purchase: Purchase
  values: Record<string, PropertyValue>
  /** Manual requirement checks for requirements without an automatic condition. */
  checks: Record<string, 'pass' | 'fail'>
  /** Additional links found while importing. */
  links: string[]
  /** Raw values that had no better place (kept so nothing from Excel is lost). */
  extra: Record<string, string>
  order: number
  createdAt: string
  updatedAt: string
}

export interface Requirement {
  id: string
  projectId: string
  category: string
  label: string
  description: string
  priority: Priority
  condition: Condition | null
  order: number
  updatedAt: string
}

export interface Settings {
  people: string[]
  lastBackupAt: string | null
  /** Show "What's new" once after a release (src/releases.ts). */
  whatsNew?: boolean
  /** The last release whose notes this person has seen. */
  seenRelease?: string
}

export interface BackupFile {
  /** 'produktvergleich' = backups made before the rename to Propario (still accepted). */
  app: 'propario' | 'produktvergleich'
  kind: 'full' | 'project'
  schemaVersion: number
  exportedAt: string
  projects: Project[]
  properties: PropertyDef[]
  products: Product[]
  requirements: Requirement[]
  settings?: Settings
}
