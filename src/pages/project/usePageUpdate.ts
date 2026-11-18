/**
 * "Update from the shop page" for one product: read the page, show what would change, take it
 * after a yes. Used by the details, and when a link that is already there is added again.
 */
import { db } from '../../db/db'
import type { Product, PropertyDef } from '../../db/types'
import { describePlan, filledLabels } from '../../domain/display'
import { planFacts } from '../../domain/page-import'
import { useI18n } from '../../i18n'
import { applyProductPage, ImageError, readProductPage } from '../../images'
import { useConfirm, useToast } from '../../ui/Dialog'

export function usePageUpdate(properties: PropertyDef[]) {
  const { m, fmt } = useI18n()
  const confirm = useConfirm()
  const toast = useToast()
  return async (product: Product, opts: { title?: string; text?: string } = {}) => {
    let page: Awaited<ReturnType<typeof readProductPage>>
    try {
      page = await readProductPage(product.url)
    } catch (e) {
      toast(m.image.error[e instanceof ImageError ? e.code : 'failed'])
      return
    }
    const current = (await db.products.get(product.id)) ?? product
    const lines = describePlan(current, planFacts(current, page.facts, properties, { refreshPrice: true }), properties, m, fmt)
    if (!current.image && page.blob) lines.push(m.field.image)
    if (!lines.length) {
      toast(opts.title ? `${opts.title} – ${m.pageUpdate.nothing}` : m.pageUpdate.nothing)
      return
    }
    const ok = await confirm({
      title: opts.title ?? m.pageUpdate.title,
      text: opts.text ?? m.pageUpdate.text,
      items: lines,
      confirmLabel: m.pageUpdate.apply,
      cancelLabel: m.pageUpdate.keep,
    })
    if (!ok) return
    const filled = await applyProductPage(current, page)
    toast(m.pageImport.filled(filledLabels(filled, m)))
  }
}
