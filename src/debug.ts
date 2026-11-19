/**
 * Troubleshooting on one device: an optional log of what the app does, and a support package to
 * download. Both are technical only – no contents of comparisons, no names: requests are logged
 * by method, path (without query), status and duration; errors by their message.
 *
 * - The log is off by default and switched on per device (Settings → Troubleshooting). It keeps
 *   the last entries in localStorage, so it survives a reload or an update – exactly when
 *   things go wrong.
 * - The support package works always: version, device, installed or not, service worker,
 *   caches, the browser's databases, storage, record counts, the start step and the log.
 */
import { currentStep } from './diagnostics'

const FLAG = 'pv.debug'
const STORE = 'pv.debug.log'
const MAX = 400

export interface Entry {
  t: string
  kind: string
  text: string
}

export function debugOn(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1'
  } catch {
    return false
  }
}

let entries: Entry[] = (() => {
  try {
    return (JSON.parse(localStorage.getItem(STORE) || '[]') as Entry[]).slice(-MAX)
  } catch {
    return []
  }
})()

let saveTimer: ReturnType<typeof setTimeout> | undefined
function save() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(entries))
    } catch {
      entries = entries.slice(-MAX / 4) // storage full: keep less
    }
  }, 500)
}

/** Notes one event – only while the log is switched on. */
export function debugLog(kind: string, text: string) {
  if (!debugOn()) return
  entries.push({ t: new Date().toISOString(), kind, text: text.slice(0, 500) })
  if (entries.length > MAX) entries = entries.slice(-MAX)
  save()
}

export function setDebug(on: boolean) {
  try {
    if (on) localStorage.setItem(FLAG, '1')
    else {
      localStorage.removeItem(FLAG)
      localStorage.removeItem(STORE)
      entries = []
    }
  } catch {
    /* storage unavailable: the log stays off */
  }
  if (on) debugLog('debug', `log on, ${__APP_VERSION__}, ${navigator.userAgent}`)
}

export const debugEntries = () => [...entries]

/** Listens to what the browser reports about the app's life; cheap when the log is off. */
export function installDebug() {
  const text = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e))
  window.addEventListener('error', (e) => debugLog('error', `${e.message} @ ${e.filename?.split('/').pop()}:${e.lineno}`))
  window.addEventListener('unhandledrejection', (e) => debugLog('rejection', text(e.reason)))
  document.addEventListener('visibilitychange', () => debugLog('visibility', document.visibilityState))
  window.addEventListener('pageshow', (e) => debugLog('page', `show${e.persisted ? ' (from back/forward cache)' : ''} ${location.pathname}`))
  window.addEventListener('online', () => debugLog('network', 'online'))
  window.addEventListener('offline', () => debugLog('network', 'offline'))
  navigator.serviceWorker?.addEventListener('controllerchange', () => debugLog('service-worker', 'new worker took over'))
  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      debugLog(`console.${level}`, args.map(text).join(' '))
      original(...args)
    }
  }
  debugLog('page', `start ${__APP_VERSION__} ${location.pathname}`)
}

/** Waits at most `ms` for `work`; a hanging browser storage must not hang the package. */
const atMost = <T>(work: Promise<T>, ms = 3000): Promise<T | 'no answer'> =>
  Promise.race([work, new Promise<'no answer'>((resolve) => setTimeout(() => resolve('no answer'), ms))]).catch(
    (e: unknown) => `failed: ${String(e)}` as 'no answer',
  )

export async function supportPackage(): Promise<Record<string, unknown>> {
  const { db } = await import('./db/db')
  const counts = atMost(
    Promise.all((['projects', 'products', 'properties', 'requirements'] as const).map(async (k) => [k, await db[k].count()] as const)).then(Object.fromEntries),
  )
  return {
    app: 'propario-support',
    created: new Date().toISOString(),
    version: __APP_VERSION__,
    server: await atMost(fetch('/version.json', { cache: 'no-store' }).then((r) => r.json())),
    startStep: currentStep(),
    device: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      installedApp: matchMedia('(display-mode: standalone)').matches,
      online: navigator.onLine,
      screen: `${screen.width}×${screen.height} @${devicePixelRatio}`,
      viewport: `${innerWidth}×${innerHeight}`,
    },
    serviceWorker: await atMost(
      (async () => {
        if (!('serviceWorker' in navigator)) return 'not supported'
        const regs = await navigator.serviceWorker.getRegistrations()
        return {
          controller: navigator.serviceWorker.controller?.scriptURL ?? null,
          registrations: regs.map((r) => ({ active: r.active?.state ?? null, waiting: !!r.waiting, installing: !!r.installing })),
        }
      })(),
    ),
    caches: await atMost<unknown>('caches' in window ? caches.keys() : Promise.resolve([])),
    databases: await atMost<unknown>(
      indexedDB.databases ? indexedDB.databases().then((d) => d.map((x) => `${x.name} v${x.version}`)) : Promise.resolve('not listed'),
    ),
    openDatabase: db.name,
    records: await counts,
    storage: await atMost<unknown>(navigator.storage?.estimate ? navigator.storage.estimate() : Promise.resolve('not supported')),
    log: { on: debugOn(), entries: debugEntries() },
  }
}

/** Saves the support package as a file. */
export async function downloadSupportPackage() {
  const data = await supportPackage()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `propario-support-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}
