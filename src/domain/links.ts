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

export const sameLink = (a: string, b: string) => !!a && !!b && linkKey(a) === linkKey(b)
