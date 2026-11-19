/**
 * Keeps a long-open app on the current version. An installed app on a phone can stay open for
 * days; after an update the server no longer has the old version's files, so the old page
 * fails as soon as it loads a part it has not loaded yet (import, Excel). Three guards:
 *
 * - Coming back to the app, it asks which version the server runs and reloads when it is newer
 *   – before anything is tapped. Edits are saved as they are made, so nothing is lost.
 * - When loading a part fails anyway, the app reloads.
 * - Anything else that breaks shows src/ui/Crash.tsx instead of a blank page.
 *
 * Each reload happens at most once a minute, so a real outage cannot cause a reload loop.
 */
const RUNNING = __APP_VERSION__
const KEY = 'propario-reloaded-at'
const PAUSE = 60_000

/** Reloads, unless that already happened within the last minute; says whether it reloads. */
export function reloadOnce(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (now - last < PAUSE) return false
    sessionStorage.setItem(KEY, String(now))
  } catch {
    return false // without a place to remember it, a loop could not be stopped
  }
  location.reload()
  return true
}

/** The version the server runs, or null when it cannot be asked (offline, outside the VPN). */
export async function serverVersion(): Promise<string | null> {
  try {
    const r = await fetch('/version.json', { cache: 'no-store' })
    if (!r.ok) return null
    return ((await r.json()) as { version?: string }).version ?? null
  } catch {
    return null
  }
}

/** True when the server runs another version than this page. */
export async function outdated(): Promise<boolean> {
  const v = await serverVersion()
  return v !== null && v !== RUNNING
}

export function keepCurrent() {
  // Vite reports a part that could not be loaded; reloading fetches the current one.
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadOnce()) e.preventDefault()
  })
  const check = async () => {
    if (document.visibilityState === 'visible' && (await outdated())) reloadOnce()
  }
  document.addEventListener('visibilitychange', () => void check())
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) void check()
  })
}
