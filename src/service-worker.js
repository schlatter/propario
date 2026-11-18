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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('propario-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const strategy = strategyFor(new URL(request.url), request.mode, self.location.origin)
  if (strategy === 'asset') {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok) await cache.put(request, response.clone())
        return response
      }),
    )
  } else if (strategy === 'page') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/offline.html')) ?? Response.error()))
  }
})
