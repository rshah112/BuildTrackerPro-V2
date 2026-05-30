import { useState } from 'react'

// Standardizes the "create or edit one row in a Sheet" state every list screen hand-rolled
// as `useState<T | 'new' | null>(null)` plus the `editing === 'new' ? undefined : editing`
// dance. Pair with <EditorSheet>.
export interface Editor<T> {
  /** Raw editing state: the row being edited, the literal 'new', or null when closed. */
  editing: T | 'new' | null
  isOpen: boolean
  isNew: boolean
  /** The row to seed a form with (undefined when creating). */
  initial: T | undefined
  openNew: () => void
  openEdit: (item: T) => void
  close: () => void
}

export function useEditor<T>(): Editor<T> {
  const [editing, setEditing] = useState<T | 'new' | null>(null)
  return {
    editing,
    isOpen: editing !== null,
    isNew: editing === 'new',
    initial: editing === 'new' || editing === null ? undefined : editing,
    openNew: () => setEditing('new'),
    openEdit: (item: T) => setEditing(item),
    close: () => setEditing(null),
  }
}
