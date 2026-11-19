import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n'

/** Native <dialog> as modal: focus handling and Escape come from the browser. */
export function Modal({
  open,
  onClose,
  children,
  className,
  labelledBy,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
  labelledBy?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className={className}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        // React hands a nested dialog's Escape on to the outer one too; only its own counts.
        if (e.target !== ref.current) return
        e.preventDefault()
        onClose()
      }}
      onMouseDown={(e) => {
        // Click on the backdrop closes the dialog.
        if (e.target === ref.current) onClose()
      }}
    >
      {open && children}
    </dialog>
  )
}

interface ConfirmOptions {
  title: string
  text?: string
  /** A list shown below the text, e.g. what an update would change. */
  items?: string[]
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>
const ConfirmCtx = createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { m } = useI18n()
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const confirm = useCallback<ConfirmFn>((o) => new Promise((resolve) => setState({ ...o, resolve })), [])
  const done = (v: boolean) => {
    state?.resolve(v)
    setState(null)
  }
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!state} onClose={() => done(false)} labelledBy="confirm-title">
        {state && (
          <div className="dialog" role="alertdialog" aria-describedby={state.text ? 'confirm-text' : undefined}>
            <h2 id="confirm-title">{state.title}</h2>
            {(state.text || state.items) && (
              <div id="confirm-text">
                {state.text && <p>{state.text}</p>}
                {state.items && (
                  <ul className="confirm-list">
                    {state.items.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="dialog-actions">
              <button className="btn" onClick={() => done(false)} autoFocus>
                {state.cancelLabel ?? m.common.cancel}
              </button>
              <button className={`btn ${state.danger ? 'danger' : 'primary'}`} onClick={() => done(true)}>
                {state.confirmLabel ?? m.common.confirm}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const c = useContext(ConfirmCtx)
  if (!c) throw new Error('useConfirm outside ConfirmProvider')
  return c
}

// ---------- toast ----------

const ToastCtx = createContext<(msg: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((text: string) => {
    setMsg(text)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 3200)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite" role="status">
        {msg && <div className="toast">{msg}</div>}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
