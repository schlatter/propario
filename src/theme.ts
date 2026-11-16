export type Theme = 'system' | 'light' | 'dark'
const KEY = 'pv.theme'

export function readTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    if (t === 'light' || t === 'dark') return t
  } catch {
    /* storage unavailable */
  }
  return 'system'
}

export function applyTheme(t: Theme) {
  if (t === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', t)
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* ignore */
  }
}
