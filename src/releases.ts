/**
 * What people see once after an update ("What's new"), at most four short lines per release,
 * in every language. Newest first. The full list is CHANGELOG.md.
 */
import type { Locale } from './i18n'

export interface Release {
  version: string
  notes: Record<Locale, string[]>
}

export const RELEASES: Release[] = [
  {
    version: '0.4.1',
    notes: {
      en: [
        'New in the details: “Update from shop page” – shows what is new and asks first.',
        'The same link twice makes no second entry.',
        'Selected products: update them from their shop pages or delete them.',
      ],
      de: [
        'Neu in den Details: „Von der Shopseite aktualisieren“ – zeigt, was neu ist, und fragt vorher.',
        'Derselbe Link zweimal ergibt keinen zweiten Eintrag.',
        'Markierte Produkte: von den Shopseiten aktualisieren oder löschen.',
      ],
    },
  },
  {
    version: '0.4.0',
    notes: {
      en: [
        'Add by link: name, brand, dimensions and data sheet come from the shop page.',
        'Filters: quick chips, and an advanced query for any field.',
        'Requirements show right in their column – green or red.',
        'Exclusion reasons, “found on” and a larger picture in the details.',
      ],
      de: [
        'Per Link hinzufügen: Name, Marke, Maße und Datenblatt kommen von der Shopseite.',
        'Filter: Schnellfilter-Chips und eine erweiterte Abfrage über jedes Feld.',
        'Anforderungen erscheinen direkt in ihrer Spalte – grün oder rot.',
        'Ausschlussgründe, Funddatum und ein größeres Bild in den Details.',
      ],
    },
  },
  {
    version: '0.3.0',
    notes: {
      en: [
        'Check elsewhere: price comparisons, Amazon and Stiftung Warentest – without tracking.',
        'Offers from several shops; the cheapest becomes the price.',
        'Ratings from tests and reviews, and a weighted fit per product.',
        'Swipe mode: decide one product at a time.',
      ],
      de: [
        'Woanders prüfen: Preisvergleiche, Amazon und Stiftung Warentest – ohne Tracking.',
        'Angebote mehrerer Shops; das günstigste wird zum Preis.',
        'Bewertungen aus Tests und Erfahrungen, dazu eine gewichtete Eignung.',
        'Swipe-Modus: Produkt für Produkt entscheiden.',
      ],
    },
  },
  {
    version: '0.2.0',
    notes: {
      en: [
        'Propario now lives on a server: sign in with a passkey, no password.',
        'Share a comparison with others – to view or to edit.',
        'Product pictures: fetched from the shop link, pasted or dropped.',
        'Comparisons from this browser can be moved to your account under Backup.',
      ],
      de: [
        'Propario läuft jetzt auf einem Server: Anmeldung per Passkey, ohne Passwort.',
        'Vergleiche mit anderen teilen – zum Ansehen oder Bearbeiten.',
        'Produktbilder: aus dem Shop-Link geladen, eingefügt oder hineingezogen.',
        'Vergleiche aus diesem Browser lassen sich unter Sicherung ins Konto verschieben.',
      ],
    },
  },
]

/** The release part of a version like 0.2.0+4d837a1. */
export const releaseOf = (version: string) => version.split('+')[0]

export const notesFor = (version: string) => RELEASES.find((r) => r.version === releaseOf(version))
