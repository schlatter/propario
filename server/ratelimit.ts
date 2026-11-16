/**
 * A small in-memory fixed-window limiter for the endpoints worth hammering (sign-in, recovery,
 * image fetching). Fine for one process; several instances behind a balancer would need a shared store.
 */
const windows = new Map<string, { count: number; resetAt: number }>()

export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  if (windows.size > 20_000) {
    for (const [name, w] of windows) if (w.resetAt <= now) windows.delete(name)
  }
  const w = windows.get(key)
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  w.count += 1
  return w.count <= limit
}

export function resetRateLimits(): void {
  windows.clear()
}
