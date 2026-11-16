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
