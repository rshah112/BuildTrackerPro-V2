import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Modal } from './Sheet'
import { Button } from './Button'

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmCtx = createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setOpts(null)
  }, [])

  const api = useMemo(() => confirm, [confirm])

  return (
    <ConfirmCtx.Provider value={api}>
      {children}
      <Modal open={opts !== null} onClose={() => settle(false)} title={opts?.title ?? ''}>
        {opts && (
          <div className="confirm-body">
            {opts.message && <p className="confirm-message">{opts.message}</p>}
            <div className="form-actions">
              <Button
                variant={opts.destructive ? 'danger' : 'primary'}
                fullWidth
                onClick={() => settle(true)}
              >
                {opts.confirmLabel ?? (opts.destructive ? 'Delete' : 'Confirm')}
              </Button>
              <Button variant="secondary" onClick={() => settle(false)}>
                {opts.cancelLabel ?? 'Cancel'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}
