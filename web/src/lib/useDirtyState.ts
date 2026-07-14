import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { setFormDirty } from './unsavedChanges'

/** useState with a global unsaved-change guard. `markClean` is called after a
 *  successful save; `resetClean` is for server data hydration or saved resets. */
export function useDirtyState<T>(initial: T | (() => T)) {
  const [value, setValueRaw] = useState(initial)
  const [dirty, setDirty] = useState(false)
  const id = useRef(Symbol('dirty-state'))

  const markDirty = useCallback(() => {
    setDirty(true)
    setFormDirty(id.current, true)
  }, [])
  const markClean = useCallback(() => {
    setDirty(false)
    setFormDirty(id.current, false)
  }, [])
  const setValue = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    markDirty()
    setValueRaw(next)
  }, [markDirty])
  const resetClean = useCallback((next: T) => {
    setValueRaw(next)
    markClean()
  }, [markClean])

  useEffect(() => () => setFormDirty(id.current, false), [])
  return { value, setValue, dirty, markDirty, markClean, resetClean }
}
