/**
 * The fields the advanced filter knows for a comparison: built-in product fields under German
 * and English names, then the comparison's own fields by their names. Own fields come first, so
 * a field called "Farbe" means that field, not the product's variant.
 */
import { isFavorite, statusOf } from './verdict.ts'
import type { Product, PropertyDef } from '../db/types'
import { splitUnit } from '../import/normalize.ts'
import { avgStars, isNew } from './display.ts'
import type { QueryField } from './query.ts'
import type { Summary } from './requirements.ts'

type F = Omit<QueryField, 'get'> & { get: (p: Product) => unknown }

export function queryFields(properties: PropertyDef[], summary: (p: Product) => Summary | undefined, me = ''): QueryField[] {
  const own: F[] = properties.map((prop) => ({
    names: [prop.name, splitUnit(prop.name).name],
    kind: prop.type === 'number' || prop.type === 'rating' ? 'number' : prop.type === 'boolean' ? 'boolean' : prop.type === 'date' ? 'date' : 'text',
    get: (p) => p.values?.[prop.id],
  }))
  const builtIn: F[] = [
    { names: ['Name', 'Produkt', 'Product'], kind: 'text', get: (p) => [p.brand, p.model].filter(Boolean).join(' ') },
    { names: ['Marke', 'Hersteller', 'Brand'], kind: 'text', get: (p) => p.brand },
    { names: ['Modell', 'Model'], kind: 'text', get: (p) => p.model },
    { names: ['Produktart', 'Art', 'Type', 'Product type'], kind: 'text', get: (p) => p.productType },
    { names: ['Variante', 'Farbe', 'Variant', 'Colour', 'Color'], kind: 'text', get: (p) => p.variant },
    { names: ['Preis', 'Price'], kind: 'number', get: (p) => p.price },
    { names: ['Händler', 'Haendler', 'Shop', 'Retailer'], kind: 'text', get: (p) => p.retailer },
    { names: ['Gefunden von', 'Found by'], kind: 'text', get: (p) => p.foundBy },
    { names: ['Funddatum', 'Gefunden am', 'Found on', 'Added'], kind: 'date', get: (p) => p.createdAt },
    { names: ['Neu', 'New'], kind: 'boolean', get: (p) => isNew(p.createdAt) },
    { names: ['Mein', 'Mine', 'Von mir'], kind: 'boolean', get: (p) => !!me && p.foundBy === me },
    {
      names: ['Auswahl', 'Selection', 'Status'],
      kind: 'text',
      get: (p) => statusOf(p),
      aliases: {
        offen: 'open',
        open: 'open',
        geprüft: 'checked',
        geprueft: 'checked',
        checked: 'checked',
        ausgeschlossen: 'excluded',
        excluded: 'excluded',
      },
    },
    { names: ['Favorit', 'Favourite', 'Favorite'], kind: 'boolean', get: (p) => isFavorite(p) },
    {
      names: ['Ausschlussgrund', 'Grund', 'Exclusion reason', 'Reason'],
      kind: 'text',
      get: (p) => p.exclusionCategory,
      aliases: {
        optik: 'looks',
        looks: 'looks',
        maße: 'size',
        masse: 'size',
        size: 'size',
        preis: 'price',
        price: 'price',
        marke: 'brand',
        brand: 'brand',
        shop: 'shop',
        qualität: 'quality',
        qualitaet: 'quality',
        quality: 'quality',
        sonstiges: 'other',
        other: 'other',
      },
    },
    { names: ['Geeignet', 'Eligible'], kind: 'boolean', get: (p) => (summary(p) ? !summary(p)!.blocked : undefined) },
    { names: ['Eignung', 'Fit'], kind: 'number', get: (p) => summary(p)?.fit },
    { names: ['Bewertung', 'Sterne', 'Rating', 'Stars'], kind: 'number', get: (p) => avgStars(p) },
    { names: ['Gekauft', 'Purchased', 'Bought'], kind: 'boolean', get: (p) => p.purchase?.status === 'purchased' },
    { names: ['Beschreibung', 'Description'], kind: 'text', get: (p) => p.description },
    { names: ['Kommentar', 'Kommentare', 'Comments'], kind: 'text', get: (p) => p.comments },
    { names: ['GTIN', 'EAN'], kind: 'text', get: (p) => p.gtin },
    { names: ['MPN', 'Herstellernummer'], kind: 'text', get: (p) => p.mpn },
  ]
  return [...own, ...builtIn] as QueryField[]
}
