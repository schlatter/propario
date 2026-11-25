/**
 * "Load images (n)": the main picture from each product link that has none yet. Offered in the
 * comparison's ⋯ menu; while it runs, the progress is announced in the page.
 */
import { useState } from 'react'
import type { Product } from '../../db/types'
import { useI18n } from '../../i18n'
import { ImageError, loadImages, missingImages } from '../../images'
import { useToast } from '../../ui/Dialog'

export function useLoadImages(products: Product[]) {
  const { m } = useI18n()
  const toast = useToast()
  // Products already tried in this session are not offered again (most failures are shops refusing automated access).
  const [tried, setTried] = useState<Set<string>>(() => new Set())
  const missing = missingImages(products).filter((p) => !tried.has(p.id))
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const load = async () => {
    if (progress) return
    setProgress({ done: 0, total: missing.length })
    try {
      const r = await loadImages(missing, (done, total) => setProgress({ done, total }))
      setTried(new Set([...tried, ...missing.map((p) => p.id)]))
      toast(m.image.bulkResult(r.loaded, r.failed.length))
    } catch (e) {
      toast(m.image.error[e instanceof ImageError ? e.code : 'failed'])
    } finally {
      setProgress(null)
    }
  }
  return { missing: missing.length, progress, load }
}
