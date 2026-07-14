import { useCallback, useEffect } from 'react'
import { useBlocker } from 'react-router-dom'
import { hasUnsavedChanges } from '../lib/unsavedChanges'

/** Keep in-app links, programmatic navigation, and browser/mobile Back from silently
 * unmounting an editor. Same-document anchors are accessibility/navigation aids, not
 * data loss, so they remain immediate. Full page exits are covered by beforeunload. */
export function UnsavedNavigationGuard() {
  const blocker = useBlocker(
    useCallback(({ currentLocation, nextLocation }) => {
      const changesScreen =
        currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search
      return changesScreen && hasUnsavedChanges()
    }, []),
  )

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm('Discard your unsaved changes?')) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  return null
}
