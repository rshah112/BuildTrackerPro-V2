import { useRef, useState, type FormEvent } from 'react'
import { Sheet } from '../../components/ui/Sheet'
import { Button } from '../../components/ui/Button'
import { Field } from '../../components/ui/Field'
import { useCreateTask } from './useTasks'
import { useDirtyState } from '../../lib/useDirtyState'
import { hasUnsavedChanges } from '../../lib/unsavedChanges'

/** Rapid punch-list capture: add to-do after to-do without the form closing, so you can walk
 *  the site logging items quickly. Mirrors the native "Punch Walk". */
export function PunchWalkSheet({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const create = useCreateTask()
  const { value: title, setValue: setTitle, markClean, resetClean } = useDirtyState('')
  const [count, setCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const add = async (e: FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    await create.mutateAsync({ projectId, title: t, status: 'todo' } as never)
    setCount((c) => c + 1)
    resetClean('')
    inputRef.current?.focus()
  }

  const done = () => {
    if (hasUnsavedChanges() && !window.confirm('Discard the unfinished punch-list item?')) return
    markClean()
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title="Punch walk">
      <p className="muted">Capture punch-list items as you walk the site — each is added as a to-do task.</p>
      <form onSubmit={add} className="form">
        <Field label="Item">
          {(p) => (
            <input
              {...p}
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              placeholder="e.g. Touch up paint in master bath"
            />
          )}
        </Field>
        <div className="form-actions form-actions-sticky">
          <Button type="submit" loading={create.isPending} fullWidth>
            Add item
          </Button>
          <Button type="button" variant="secondary" onClick={done}>
            Done{count > 0 ? ` (${count})` : ''}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
