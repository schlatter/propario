/**
 * When two product links mean the same page: same host (with or without www), same path (with
 * or without a trailing slash), same query apart from tracking parameters, any #fragment.
 */
const TRACKING = /^(utm_\w+|gclid|gbraid|wbraid|fbclid|msclkid|mc_cid|mc_eid|srsltid|_ga|ref|refid|affiliate|partner|campaign|cmpid|wt_mc|sc_src|emid)$/i

export function linkKey(url: string): string {
  try {
    const u = new URL(url.trim())
    const params = [...u.searchParams].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b))
    const query = params.length ? `?${new URLSearchParams(params).toString()}` : ''
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '') || '/'}${query}`
  } catch {
    return url.trim()
  }
}

/** The link without tracking parameters (utm_…, gclid …), as Propario keeps it; anything else unchanged. */
export function withoutTracking(url: string): string {
  try {
    const u = new URL(url.trim())
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k)
    return u.href
  } catch {
    return url.trim()
  }
}

export const sameLink = (a: string, b: string) => !!a && !!b && linkKey(a) === linkKey(b)

/**
 * The product link in what another app shares: `url` when it is one, else the first http(s)
 * link in the text or title ("Look at this: https://…" – where many Android apps put it).
 */
export function sharedLink(shared: { url?: string | null; text?: string | null; title?: string | null }): string | null {
  for (const candidate of [shared.url, shared.text, shared.title]) {
    const m = (candidate ?? '').match(/https?:\/\/[^\s<>"']+/i)
    if (m) return m[0].replace(/[.,;:!?)\]]+$/, '')
  }
  return null
}
