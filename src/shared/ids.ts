/** Ids and timestamps shared by the browser and the server (plain, erasable TypeScript). */

export const nowIso = () => new Date().toISOString()

/** UUID v4. Falls back to getRandomValues because randomUUID needs a secure context. */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function' && globalThis.isSecureContext !== false) {
    try {
      return crypto.randomUUID()
    } catch {
      /* fall through */
    }
  }
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
