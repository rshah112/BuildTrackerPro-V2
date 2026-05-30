import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, AlertCircle, Info } from 'lucide-react'

type ToastTone = 'success' | 'error' | 'info'
interface ToastAction {
  label: string
  onClick: () => void
}
interface ToastOptions {
  action?: ToastAction
}
interface ToastItem {
  id: number
  message: string
  tone: ToastTone
  action?: ToastAction
}
interface ToastApi {
  show: (message: string, tone?: ToastTone, opts?: ToastOptions) => void
  success: (message: string, opts?: ToastOptions) => void
  error: (message: string) => void
}

const ToastCtx = createContext<ToastApi | null>(null)
const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info }
const DURATION = 3200

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
    const handle = timers.current.get(id)
    if (handle) {
      clearTimeout(handle)
      timers.current.delete(id)
    }
  }, [])

  const show = useCallback(
    (message: string, tone: ToastTone = 'info', opts?: ToastOptions) => {
      const id = ++seq.current
      setItems((prev) => [...prev, { id, message, tone, action: opts?.action }])
      timers.current.set(
        id,
        // Actionable toasts (e.g. Undo) linger a bit longer so they're tappable.
        setTimeout(() => dismiss(id), opts?.action ? DURATION + 2300 : DURATION),
      )
    },
    [dismiss],
  )

  // Stable api object (reference never changes) — no ref-mutation-in-render.
  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m: string, opts?: ToastOptions) => show(m, 'success', opts),
      error: (m: string) => show(m, 'error'),
    }),
    [show],
  )

  useEffect(() => {
    const active = timers.current
    return () => active.forEach(clearTimeout)
  }, [])

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="toast-stack" aria-live="polite" aria-relevant="additions">
            {items.map((t) => {
              const Glyph = ICONS[t.tone]
              return (
                <div
                  key={t.id}
                  className={`toast toast-${t.tone}`}
                  role={t.tone === 'error' ? 'alert' : 'status'}
                >
                  <Glyph size={18} aria-hidden />
                  <span>{t.message}</span>
                  {t.action && (
                    <button
                      type="button"
                      className="toast-action"
                      onClick={() => {
                        t.action?.onClick()
                        dismiss(t.id)
                      }}
                    >
                      {t.action.label}
                    </button>
                  )}
                </div>
              )
            })}
          </div>,
          document.body,
        )}
    </ToastCtx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
