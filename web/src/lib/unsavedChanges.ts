const dirtyForms = new Set<symbol>()

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (dirtyForms.size === 0) return
  event.preventDefault()
  event.returnValue = ''
}

function syncUnloadGuard() {
  if (typeof window === 'undefined') return
  window.removeEventListener('beforeunload', onBeforeUnload)
  if (dirtyForms.size > 0) window.addEventListener('beforeunload', onBeforeUnload)
}

export function setFormDirty(id: symbol, dirty: boolean): void {
  if (dirty) dirtyForms.add(id)
  else dirtyForms.delete(id)
  syncUnloadGuard()
}

export function hasUnsavedChanges(): boolean {
  return dirtyForms.size > 0
}
