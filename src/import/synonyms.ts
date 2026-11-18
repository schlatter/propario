import type { Priority } from '../db/types'
import { norm } from './normalize'

/** Targets a spreadsheet column can be mapped to. */
export type FieldTarget =
  | 'brand'
  | 'model'
  | 'productType'
  | 'price'
  | 'priceNote'
  | 'gtin'
  | 'mpn'
  | 'retailer'
  | 'url'
  | 'imageUrl'
  | 'variant'
  | 'description'
  | 'comments'
  | 'foundBy'
  | 'candidate'
  | 'favoriteRank'
  | 'exclusionReason'
  | 'purchaseDate'
  | 'purchasePrice'
  | 'overall'
  | 'pros'
  | 'cons'
  | 'link'
  | 'personNote'
  | 'property'
  | 'ignore'

export const FIELD_TARGETS: FieldTarget[] = [
  'brand',
  'model',
  'productType',
  'price',
  'priceNote',
  'gtin',
  'mpn',
  'retailer',
  'url',
  'imageUrl',
  'variant',
  'description',
  'comments',
  'foundBy',
  'candidate',
  'favoriteRank',
  'exclusionReason',
  'purchaseDate',
  'purchasePrice',
  'overall',
  'pros',
  'cons',
  'link',
  'personNote',
  'property',
  'ignore',
]

/** Targets that hold one value per product; a second column for them becomes a property. */
export const SINGLE_TARGETS: FieldTarget[] = [
  'brand',
  'model',
  'productType',
  'price',
  'priceNote',
  'gtin',
  'mpn',
  'retailer',
  'url',
  'imageUrl',
  'variant',
  'foundBy',
  'candidate',
  'favoriteRank',
  'purchaseDate',
  'purchasePrice',
]

/** German and English header names (compared after `norm`). Includes the app's own export headers. */
const PRODUCT_SYNONYMS: Partial<Record<FieldTarget, string[]>> = {
  brand: ['anbieter', 'hersteller', 'marke', 'hersteller marke', 'brand', 'manufacturer', 'vendor', 'make'],
  model: ['system', 'modell', 'model', 'produkt', 'produktname', 'modell produktname', 'product', 'product name', 'model product name', 'bezeichnung', 'name'],
  productType: ['produktart', 'möbelart', 'product type', 'art', 'gerätetyp'],
  price: ['preis', 'price', 'kosten', 'cost', 'preis eur', 'price eur'],
  priceNote: ['preisnotiz', 'price note', 'preisstand'],
  gtin: ['gtin', 'ean', 'gtin ean', 'ean code', 'barcode'],
  mpn: ['mpn', 'herstellernummer', 'herstellerartikelnummer', 'manufacturer part no', 'part number', 'artikelnummer hersteller'],
  retailer: ['händler', 'haendler', 'shop', 'retailer', 'store', 'bezugsquelle', 'verkäufer', 'seller'],
  url: ['link', 'produktlink', 'url', 'product link', 'produktseite', 'webseite', 'website'],
  imageUrl: ['bild', 'produktbild', 'image', 'image url', 'product image', 'foto'],
  variant: ['variante', 'farbe variante', 'variant', 'colour variant', 'color variant'],
  description: ['beschreibung', 'kurzbeschreibung', 'description', 'short description'],
  comments: [
    'kommentar',
    'kommentare',
    'bemerkung',
    'bemerkungen',
    'anmerkung',
    'anmerkungen',
    'comment',
    'comments',
    'hinweise',
    'hinweise quellenlage',
    'notes',
  ],
  foundBy: ['gefunden von', 'found by', 'entdeckt von'],
  candidate: ['auswahl', 'einschätzung', 'favorit', 'favoritenstatus', 'candidate', 'selection', 'assessment', 'favorite status', 'shortlist'],
  favoriteRank: ['favoritenrang', 'rang', 'favorite rank', 'rank'],
  exclusionReason: ['ausschlussgrund', 'ausschluss kompromissgrund', 'ausschluss', 'exclusion reason', 'reason for exclusion'],
  purchaseDate: ['gekauft', 'kaufdatum', 'gekauft am', 'purchased', 'purchase date', 'bought'],
  purchasePrice: ['kaufpreis', 'tatsächlicher kaufpreis', 'purchase price', 'actual purchase price', 'actual price paid', 'paid'],
  overall: ['gesamteindruck', 'overall impression', 'overall'],
  pros: ['vorteile', 'pro', 'pros', 'advantages'],
  cons: ['nachteile', 'contra', 'cons', 'disadvantages'],
  ignore: ['id', 'nr', '#', 'lfd nr'],
}

export type ReqTarget = 'category' | 'label' | 'priority' | 'description' | 'rule' | 'ignore'

const REQ_SYNONYMS: Record<Exclude<ReqTarget, 'ignore'>, string[]> = {
  category: ['kategorie', 'category', 'bereich', 'gruppe'],
  label: ['anforderung', 'requirement', 'bezeichnung', 'kriterium', 'criterion', 'name'],
  priority: ['priorität', 'prioritaet', 'priority', 'prio'],
  description: ['details begründung', 'details', 'beschreibung', 'description', 'begründung', 'reason'],
  rule: ['regel', 'rule', 'grenzwert', 'wert', 'value', 'threshold', 'prüfung', 'check'],
}

function lookup<T extends string>(table: Partial<Record<T, string[]>>, header: string): T | null {
  const h = norm(header)
  if (!h) return null
  for (const [target, list] of Object.entries(table) as [T, string[]][]) {
    if (list.some((s) => norm(s) === h)) return target
  }
  // header with a trailing unit, e.g. "Preis (€)" → "preis"
  const stripped = norm(header.replace(/\([^)]*\)/g, ''))
  if (stripped !== h) return lookup(table, stripped)
  return null
}

export function productTargetFor(header: string): FieldTarget | null {
  return lookup(PRODUCT_SYNONYMS, header)
}

export function reqTargetFor(header: string): ReqTarget | null {
  return lookup(REQ_SYNONYMS, header)
}

const PRIORITY_WORDS: [Priority, string[]][] = [
  ['must', ['muss', 'must', 'must have', 'muss kriterium', 'musskriterium', 'pflicht', 'zwingend', 'required']],
  ['important', ['wichtig', 'important', 'should', 'should have', 'soll', 'sollte']],
  ['wish', ['wunsch', 'wish', 'nice to have', 'kann', 'could', 'wünschenswert']],
  ['bonus', ['bonus', 'option', 'plus', 'extra']],
  ['exclusion', ['ausschluss', 'ausschlusskriterium', 'exclusion', 'no go', 'nogo', 'ko', 'k o', 'knock out', 'darf nicht']],
  ['avoid', ['vermeiden', 'eher nicht', 'avoid', 'lieber nicht', 'negativ']],
  ['info', ['info', 'information', 'offen', 'open', 'positiv', 'positive', 'favorit', 'favorite', 'referenz', 'reference', 'hinweis', 'notiz', 'note']],
]

export function priorityFor(text: string): Priority | null {
  const t = norm(text)
  for (const [p, words] of PRIORITY_WORDS) if (words.some((w) => norm(w) === t)) return p
  return null
}

/** Section headings below the product rows in hand-maintained sheets. */
export function sectionKind(text: string): 'requirements' | 'notes' | null {
  const t = norm(text)
  if (/(^|\s)(anforderungen|anforderung|requirements|kriterien)(\s|$)/.test(t)) return 'requirements'
  if (/^(aktuelles system|ehemaliges system|links|notizen|notes|quellen|sources|verfügbarkeit|recherche)/.test(t)) return 'notes'
  return null
}
