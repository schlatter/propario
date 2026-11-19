/**
 * Moving rows of an editable table by their handle: drag with mouse, finger or pen, or press
 * ↑ ↓ on the handle. Used by the requirements and the fields, so both behave the same.
 * `ids` are the rows as shown; `onDrop` gets the moved row, the row it lands next to, and
 * whether it goes after it.
 */
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

export interface RowDrag {
  /** On the row (`<tr>`): its id and its state while dragging. */
  row: (id: string) => { 'data-id': string; className: string | undefined }
  /** On the handle (`<button>`). */
  handle: (id: string) => {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => void
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => void
    onPointerUp: () => void
    onPointerCancel: () => void
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
    'aria-keyshortcuts': string
  }
  /** On the `<tbody>`. */
  body: React.RefObject<HTMLTableSectionElement | null>
}

export function useRowDrag(ids: string[], onDrop: (id: string, targetId: string, after: boolean) => void): RowDrag {
  const body = useRef<HTMLTableSectionElement>(null)
  const [drag, setDrag] = useState<{ id: string; target: string | null; after: boolean } | null>(null)

  const over = (clientY: number) => {
    if (!drag || !body.current) return
    const rows = [...body.current.querySelectorAll<HTMLTableRowElement>('tr[data-id]')]
    for (const tr of rows) {
      const box = tr.getBoundingClientRect()
      if (clientY < box.top + box.height / 2) return setDrag({ ...drag, target: tr.dataset.id!, after: false })
    }
    const last = rows[rows.length - 1]
    if (last) setDrag({ ...drag, target: last.dataset.id!, after: true })
  }
  const by = (id: string, delta: -1 | 1) => {
    const target = ids[ids.indexOf(id) + delta]
    if (target) onDrop(id, target, delta === 1)
  }

  return {
    body,
    row: (id) => {
      const drop = drag && drag.target === id && drag.target !== drag.id ? (drag.after ? 'drop-after' : 'drop-before') : null
      return { 'data-id': id, className: [drag?.id === id && 'is-dragging', drop].filter(Boolean).join(' ') || undefined }
    },
    handle: (id) => ({
      'aria-keyshortcuts': 'ArrowUp ArrowDown',
      onPointerDown: (e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        setDrag({ id, target: null, after: false })
      },
      onPointerMove: (e) => over(e.clientY),
      onPointerUp: () => {
        if (drag?.target && drag.target !== drag.id) onDrop(drag.id, drag.target, drag.after)
        setDrag(null)
      },
      onPointerCancel: () => setDrag(null),
      onKeyDown: (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
        e.preventDefault()
        by(id, e.key === 'ArrowUp' ? -1 : 1)
      },
    }),
  }
}
