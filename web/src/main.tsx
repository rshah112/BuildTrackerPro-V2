import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { queryClient } from './lib/queryClient.ts'
import { initTheme } from './lib/theme.ts'
import { ToastProvider } from './components/ui/Toast.tsx'
import { ConfirmProvider } from './components/ui/Confirm.tsx'
import { reloadOnceForChunk } from './lib/chunkReload.ts'

initTheme()

// iOS-only app: pinch- and double-tap-zoom break the fixed layout, and Safari ignores
// `user-scalable=no` outside installed-PWA mode — so block the gestures directly. Safari's
// non-standard `gesture*` events cover pinch; the multi-touch `touchmove` guard is a backstop.
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener('gesturechange', (e) => e.preventDefault())
document.addEventListener('touchmove', (e) => { if ((e as TouchEvent).touches.length > 1) e.preventDefault() }, { passive: false })

// A lazy route whose hashed chunk was replaced by a deploy fails to preload; Vite fires
// this. Reload once to fetch the fresh shell instead of leaving a dead/blank route.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  reloadOnceForChunk()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
