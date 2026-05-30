import { useEffect } from 'react'

/** Minimal pull-to-refresh: when the page is scrolled to the top and the user drags
 *  down past a threshold, fire `onRefresh` once per gesture. Touch-only, so it never
 *  interferes with desktop/mouse use. */
export function usePullToRefresh(onRefresh: () => void) {
  useEffect(() => {
    let startY = 0
    let armed = false

    const atTop = () => window.scrollY <= 0 && document.documentElement.scrollTop <= 0
    // A Sheet/Modal locks body scroll while open; never arm pull-to-refresh underneath
    // it, so dragging inside an open sheet can't trigger a full data refresh.
    const overlayOpen = () => document.body.style.overflow === 'hidden'

    const onStart = (e: TouchEvent) => {
      armed = atTop() && !overlayOpen()
      startY = e.touches[0]?.clientY ?? 0
    }
    const onMove = (e: TouchEvent) => {
      if (!armed) return
      const dy = (e.touches[0]?.clientY ?? 0) - startY
      if (dy > 90) {
        armed = false
        onRefresh()
      }
    }
    const onEnd = () => {
      armed = false
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [onRefresh])
}
