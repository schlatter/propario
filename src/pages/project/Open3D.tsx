import { lazy, Suspense, useState } from 'react'
import type { Product } from '../../db/types'
import { displayName } from '../../domain/display'
import { sizeFields, sizeOf } from '../../domain/size'
import { useI18n } from '../../i18n'
import { productImage } from '../../images'
import { Glyph } from '../../ui/Glyph'
import type { ProjectData } from './useProjectData'

/** three.js is large: loaded only when someone opens the 3D view. */
const Model3D = lazy(() => import('./Model3D'))

/**
 * "3D" for the products given – side by side (comparison, duel) or one product from its
 * details, where its form can be set too. Shown only when a product's size is fully known.
 */
export function Open3D({ products, data, edit }: { products: Product[]; data: ProjectData; edit?: boolean }) {
  const { m } = useI18n()
  const [open, setOpen] = useState(false)
  const fields = sizeFields(data.properties)
  const items = products.map((p) => ({
    id: p.id,
    name: p.model || displayName(p, m),
    size: sizeOf(p, fields),
    shape: p.shape,
    drawing: p.drawing,
    photo: productImage(p),
    // Photos only: marked for a side (with corners where set), and the main photo for the front.
    // The drawing comes separately – its lines are used where no photo fits.
    pictures: {
      front: p.views?.front ? { ...p.views.front, marked: true } : productImage(p) ? { src: productImage(p)!, crop: null, marked: false } : undefined,
      side: p.views?.side ? { ...p.views.side, marked: true } : undefined,
      back: p.views?.back ? { ...p.views.back, marked: true } : undefined,
    },
  }))
  const known = items.some((i) => (i.size.width && i.size.height && i.size.depth) || i.shape?.length)
  if (!known) return null
  return (
    <>
      <button type="button" className="btn sm" onClick={() => setOpen(true)} aria-label={edit ? m.model3d.openOne : m.model3d.openLabel}>
        <Glyph name="cube" /> {m.model3d.open}
      </button>
      {open && (
        <Suspense fallback={null}>
          <Model3D items={items} edit={edit ? products[0] : undefined} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
