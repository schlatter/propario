/**
 * Propario's service worker – deliberately small.
 *
 * It keeps only the app's own versioned files (/assets/*, whose names change with every build)
 * so the app starts fast and counts as installable on every Android browser, and it shows a
 * friendly page when there is no connection (e.g. outside the VPN). It never stores pages, API
 * answers or pictures: comparisons are personal and must not linger in a cache, and pages
 * always come fresh, so an update is never hidden behind an old copy. Old versions are removed
 * when a new one takes over.
 *
 * `__VERSION__` is filled in by the build (vite.config.ts).
 */
const CACHE = 'propario-__VERSION__'
const SHELL = ['/offline.html', '/favicon.svg', '/icon-192.png']

/** What to do with a request: serve a versioned file from the cache, a page with an offline fallback, or leave it alone. */
function strategyFor(url, mode, origin) {
  if (url.origin !== origin) return 'network'
  if (url.pathname.startsWith('/assets/')) return 'asset'
  if (mode === 'navigate') return 'page'
  return 'network'
}

/**
 * A versioned file: from the cache when it answers quickly, else from the network. A browser
 * whose storage hangs must never hold the app up, and storing a copy never delays the answer.
 */
async function fromCacheOrNetwork(request, store, network, later, wait = 2000) {
  const cached = await Promise.race([store.match(request).catch(() => undefined), new Promise((resolve) => setTimeout(resolve, wait))])
  if (cached) return cached
  const response = await network(request)
  if (response.ok) later(Promise.resolve(store.put(request, response.clone())).catch(() => {}))
  return response
}

/** Waits for `work`, but at most `ms`: a hanging browser storage must not block an update. */
const atMost = (work, ms = 3000) => Promise.race([Promise.resolve(work).catch(() => {}), new Promise((resolve) => setTimeout(resolve, ms))])

const store = {
  match: (request) => caches.open(CACHE).then((cache) => cache.match(request)),
  put: (request, response) => caches.open(CACHE).then((cache) => cache.put(request, response)),
}

self.addEventListener('install', (event) => {
  event.waitUntil(atMost(caches.open(CACHE).then((cache) => cache.addAll(SHELL))).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    atMost(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('propario-') && key !== CACHE).map((key) => caches.delete(key))))).then(
      () => self.clients.claim(),
    ),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const strategy = strategyFor(new URL(request.url), request.mode, self.location.origin)
  if (strategy === 'asset') {
    event.respondWith(fromCacheOrNetwork(request, store, fetch, (p) => event.waitUntil(p)))
  } else if (strategy === 'page') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/offline.html')) ?? Response.error()))
  }
})
