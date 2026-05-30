import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  /** Centered modal instead of a bottom sheet. */
  centered?: boolean
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Ref-counted body scroll lock so stacked sheets don't unlock the body when only
// one of them closes.
let lockCount = 0
let savedOverflow = ''
function lockScroll() {
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  lockCount++
}
function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) document.body.style.overflow = savedOverflow
}

/** iOS-style bottom sheet (or centered modal). Portals to <body>, traps focus, locks
 *  scroll, and dismisses on backdrop click / Escape. */
export function Sheet({ open, onClose, title, children, footer, centered = false }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement as HTMLElement | null
    lockScroll()

    const panel = panelRef.current
    // Focus the first focusable child, else the panel itself (it has tabIndex=-1).
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE)
    ;(firstFocusable ?? panel)?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) {
        // Nothing focusable inside — keep focus on the panel rather than letting
        // it escape to the page behind the modal.
        e.preventDefault()
        panel.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      unlockScroll()
      // Best effort — no-ops if the trigger has since unmounted.
      if (restoreRef.current?.isConnected) restoreRef.current.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className={`overlay${centered ? ' overlay-centered' : ''}`}>
      <div className="overlay-backdrop" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        className={centered ? 'modal-panel' : 'sheet-panel'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        {!centered && <div className="sheet-grabber" aria-hidden />}
        {title && (
          <header className="sheet-header">
            <h2 className="sheet-title">{title}</h2>
            <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
              <X size={20} aria-hidden />
            </button>
          </header>
        )}
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

export function Modal(props: Omit<SheetProps, 'centered'>) {
  return <Sheet {...props} centered />
}
