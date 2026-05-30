import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, AlertCircle, Info } from 'lucide-react'

type ToastTone = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}
interface ToastApi {
  show: (message: string, tone?: ToastTone) => void
  success: (message: string) => void
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
    (message: string, tone: ToastTone = 'info') => {
      const id = ++seq.current
      setItems((prev) => [...prev, { id, message, tone }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION),
      )
    },
    [dismiss],
  )

  const api = useRef<ToastApi>({
    show,
    success: (m: string) => show(m, 'success'),
    error: (m: string) => show(m, 'error'),
  })
  // keep closure fresh
  api.current.show = show
  api.current.success = (m: string) => show(m, 'success')
  api.current.error = (m: string) => show(m, 'error')

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  return (
    <ToastCtx.Provider value={api.current}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="toast-stack" role="region" aria-label="Notifications">
            {items.map((t) => {
              const Glyph = ICONS[t.tone]
              return (
                <div key={t.id} className={`toast toast-${t.tone}`} role="status">
                  <Glyph size={18} aria-hidden />
                  <span>{t.message}</span>
                </div>
              )
            })}
          </div>,
          document.body,
        )}
    </ToastCtx.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
