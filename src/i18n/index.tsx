import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { de } from './de'
import { en, type Messages } from './en'

export const LOCALES = { en, de } as const
export type Locale = keyof typeof LOCALES
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', de: 'Deutsch' }

const STORAGE_KEY = 'pv.locale'

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && saved in LOCALES) return saved as Locale
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en'
}

interface I18n {
  locale: Locale
  setLocale: (l: Locale) => void
  m: Messages
  fmt: Formatters
}

export interface Formatters {
  money: (n: number | null | undefined) => string
  number: (n: number) => string
  date: (iso: string) => string
  dateTime: (iso: string) => string
  relative: (iso: string) => string
  bytes: (n: number) => string
}

function makeFormatters(tag: string): Formatters {
  const money = new Intl.NumberFormat(tag, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2, minimumFractionDigits: 0 })
  const num = new Intl.NumberFormat(tag, { maximumFractionDigits: 3 })
  const date = new Intl.DateTimeFormat(tag, { day: '2-digit', month: '2-digit', year: 'numeric' })
  const dateTime = new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeStyle: 'short' })
  const rel = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' })
  return {
    money: (n) => (n === null || n === undefined ? '' : money.format(n)),
    number: (n) => num.format(n),
    date: (iso) => {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso)
      return isNaN(d.getTime()) ? iso : date.format(d)
    },
    dateTime: (iso) => {
      const d = new Date(iso)
      return isNaN(d.getTime()) ? iso : dateTime.format(d)
    },
    relative: (iso) => {
      const diff = (new Date(iso).getTime() - Date.now()) / 1000
      const abs = Math.abs(diff)
      if (abs < 60) return rel.format(Math.round(diff), 'second')
      if (abs < 3600) return rel.format(Math.round(diff / 60), 'minute')
      if (abs < 86400) return rel.format(Math.round(diff / 3600), 'hour')
      if (abs < 86400 * 30) return rel.format(Math.round(diff / 86400), 'day')
      return date.format(new Date(iso))
    },
    bytes: (n) => {
      const units = ['B', 'KB', 'MB', 'GB']
      let i = 0
      while (n >= 1024 && i < units.length - 1) {
        n /= 1024
        i++
      }
      return `${num.format(Math.round(n * 10) / 10)} ${units[i]}`
    },
  }
}

const Ctx = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)
  const value = useMemo<I18n>(() => {
    const m = LOCALES[locale]
    return {
      locale,
      m,
      fmt: makeFormatters(m.locale),
      setLocale: (l) => {
        setLocaleState(l)
        try {
          localStorage.setItem(STORAGE_KEY, l)
        } catch {
          /* ignore */
        }
      },
    }
  }, [locale])
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): I18n {
  const v = useContext(Ctx)
  if (!v) throw new Error('useI18n outside I18nProvider')
  return v
}
