/**
 * The interface language outside React (e.g. names of fields created while importing). The
 * provider in index.tsx starts from the same choice and saves changes under the same key.
 */
import { de } from './de'
import { en, type Messages } from './en'

export const LOCALES = { en, de } as const
export type Locale = keyof typeof LOCALES
export const STORAGE_KEY = 'pv.locale'

export function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && saved in LOCALES) return saved as Locale
  } catch {
    /* storage unavailable */
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en'
}

export const activeMessages = (): Messages => LOCALES[initialLocale()]
