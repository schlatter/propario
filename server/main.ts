/**
 * Propario production server: the built app (dist/), the API and housekeeping.
 * Dependencies: Node.js 22.18+ (runs this TypeScript directly) and @simplewebauthn/server.
 * Configuration: see server/env.ts and docs/self-hosting.md.
 */
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import http from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import { createApp } from './app.ts'
import { openDatabase } from './db.ts'
import { loadConfig } from './env.ts'
import { collectGarbage } from './store.ts'
import { purgeExpired } from './users.ts'

const config = loadConfig()
const ROOT = resolve(process.env.PROPARIO_DIST || join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist'))
const db = openDatabase(join(config.dataDir, 'propario.db'))
/** The build's version (written by `vite build`), e.g. 0.2.0+4d837a1. */
const version = await readFile(join(ROOT, 'version.json'), 'utf8')
  .then((t) => (JSON.parse(t) as { version: string }).version)
  .catch(() => null)
const app = createApp(db, config, version)

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.webmanifest'])
const gzipCache = new Map<string, Buffer>()

async function resolveFile(urlPath: string): Promise<{ file: string; size: number } | null> {
  let p: string
  try {
    p = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  const file = normalize(join(ROOT, p))
  if (file !== ROOT && !file.startsWith(ROOT + sep)) return null
  try {
    const s = await stat(file)
    return s.isFile() ? { file, size: s.size } : null
  } catch {
    return null
  }
}

async function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' })
    return void res.end()
  }
  const path = (req.url || '/').split('?')[0]
  const isAsset = path.startsWith('/assets/')
  let hit = path !== '/' ? await resolveFile(path) : null
  if (!hit) {
    if (isAsset || extname(path)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      return void res.end('Not found\n')
    }
    hit = await resolveFile('/index.html') // single-page app
    if (!hit) {
      res.writeHead(500)
      return void res.end('Build missing\n')
    }
  }
  const ext = extname(hit.file)
  const headers: Record<string, string | number> = {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    // Hashed build assets never change; the page itself is always revalidated so updates arrive.
    'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    Vary: 'Accept-Encoding',
  }
  if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
    let body = gzipCache.get(hit.file)
    if (!body) {
      body = zlib.gzipSync(await readFile(hit.file), { level: 9 })
      gzipCache.set(hit.file, body)
    }
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': body.length })
    return void res.end(req.method === 'HEAD' ? undefined : body)
  }
  res.writeHead(200, { ...headers, 'Content-Length': hit.size })
  if (req.method === 'HEAD') return void res.end()
  createReadStream(hit.file).pipe(res)
}

const server = http.createServer((req, res) =>
  app.handle(req, res, () =>
    serveStatic(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    }),
  ),
)
server.requestTimeout = 60_000
server.headersTimeout = 20_000

const housekeeping = () => {
  try {
    purgeExpired(db)
    collectGarbage(db)
  } catch (e) {
    console.error('[housekeeping]', e)
  }
}
housekeeping()
const timer = setInterval(housekeeping, 3600_000)
timer.unref()

server.listen(config.port, config.host, () => {
  console.log(`Propario ${version ?? '(unknown version)'} listening on ${config.host}:${config.port}, public address ${config.origin}`)
  const link = app.setupLink()
  if (link) console.log(`\nNo account yet. Open this one-time setup link to create the first (admin) account:\n  ${link}\n`)
})

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () =>
    server.close(() => {
      db.close()
      process.exit(0)
    }),
  )
}
