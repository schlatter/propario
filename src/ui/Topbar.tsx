import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** The part of the top bar a page may fill (title, actions); null until the bar is mounted. */
export const TopbarSlot = createContext<HTMLElement | null>(null)

/** Renders its children into the top bar, next to the Propario mark. */
export function InTopbar({ children }: { children: ReactNode }) {
  const slot = useContext(TopbarSlot)
  return slot ? createPortal(children, slot) : null
}
