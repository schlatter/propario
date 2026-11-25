import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
/** Configuration from environment variables. The table is in docs/self-hosting.md. */
export interface Config {
  /** Public address, e.g. https://propario.example.org. Passkeys are bound to it. */
  origin: string
  dataDir: string
  port: number
  host: string
  production: boolean
  /** Fetch product images from shop pages on request. */
  imageFetch: boolean
  /** People may connect their own AI (server/ai.ts). */
  ai: boolean
  /** Header carrying the visitor's address when behind a trusted reverse proxy (e.g. X-Forwarded-For). */
  addressHeader: string
  xffDepth: number
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production'
  const port = Number(env.PORT || (production ? 8080 : 5173))
  const origin = (env.ORIGIN || '').replace(/\/+$/, '') || (production ? '' : `http://localhost:${port}`)
  if (!origin) throw new Error('Set ORIGIN to the public address, e.g. ORIGIN=https://propario.example.org')
  const u = new URL(origin)
  if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
    throw new Error('ORIGIN must use https (passkeys need a secure context); only localhost may use http')
  }
  if (production && !env.DATA_KEY) throw new Error('Set DATA_KEY (openssl rand -base64 32); it encrypts all comparisons at rest')
  return {
    origin,
    dataDir: env.DATA_DIR || (production ? '/data' : './data'),
    port,
    host: env.HOST || (production ? '0.0.0.0' : '127.0.0.1'),
    production,
    imageFetch: (env.PROPARIO_IMAGE_FETCH || 'on') !== 'off',
    ai: (env.PROPARIO_AI || 'on') !== 'off',
    addressHeader: (env.ADDRESS_HEADER || '').toLowerCase(),
    xffDepth: Math.max(1, Number(env.XFF_DEPTH || 1)),
  }
}

/**
 * The key `npm run dev` encrypts with, so development stores data as production does: DATA_KEY
 * when it is set (e.g. production's key, to open its data), otherwise the key in `file`
 * (git-ignored, outside the data folder), made once on the first start. There is no unencrypted
 * mode.
 */
export function devDataKey(value: string | undefined, file: string): { key: string; note: string } {
  if (value) return { key: value, note: 'Development data is encrypted with DATA_KEY.' }
  if (existsSync(file)) return { key: readFileSync(file, 'utf8').trim(), note: `Development data is encrypted with the key in ${file}.` }
  const key = randomBytes(32).toString('base64')
  writeFileSync(file, key + '\n', { mode: 0o600, flag: 'wx' })
  return { key, note: `Development data is encrypted with a new key, kept in ${file}. Keep it: without it the data folder cannot be read.` }
}
