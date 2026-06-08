import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'

const DEFAULT_ERROR = 'Save failed — please try again.'

// Shared create/update plumbing for the entity forms. Encapsulates the draft state, the
// create-vs-edit submit branch, the `busy` flag, and the text/date field-change helpers
// that every form re-implemented. Behavior is identical to the hand-rolled versions:
// editing seeds the draft from `initial` (so the patch carries the full row, as before),
// creating seeds from `blank`.

type AnyChange = ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>

interface Mutation<TDraft, TEntity> {
  mutateAsync: (input: TDraft) => Promise<TEntity>
  isPending: boolean
}
interface UpdateMutation<TDraft, TEntity> {
  mutateAsync: (args: { id: string; patch: TDraft }) => Promise<TEntity>
  isPending: boolean
}

export function useEntityForm<TEntity extends { id: string }, TDraft extends object>(opts: {
  initial?: TEntity
  blank: TDraft
  create: Mutation<TDraft, TEntity>
  update: UpdateMutation<TDraft, TEntity>
  /** Optional last-mile shaping of the draft before it's sent (e.g. normalize empties,
   *  derive a completedAt, upload an attachment). May be async. Applied to both create
   *  and update payloads. */
  transform?: (draft: TDraft) => TDraft | Promise<TDraft>
  onSaved?: (saved: TEntity) => void | Promise<void>
  onDone: () => void
}) {
  const { initial, blank, create, update, transform, onSaved, onDone } = opts
  const [d, setD] = useState<TDraft>((initial as unknown as TDraft) ?? blank)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Hard re-entry guard: submit() runs an async transform (receipt upload, vendor auto-create)
  // BEFORE the mutation flips isPending, so without this a rapid double-tap fires two creates
  // (duplicate rows). The ref blocks re-entry synchronously; the state drives the disabled UI.
  const submittingRef = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const busy = submitting || create.isPending || update.isPending

  const set = <K extends keyof TDraft>(k: K, v: TDraft[K]) => setD((p) => ({ ...p, [k]: v }))
  /** Bind a text/select control: `<input value={d.x} onChange={text('x')} />`. */
  const text = (k: keyof TDraft) => (e: AnyChange) => set(k, e.target.value as TDraft[keyof TDraft])
  /** Bind a date input, storing '' as null (matches existing date handling). */
  const date = (k: keyof TDraft) => (e: ChangeEvent<HTMLInputElement>) =>
    set(k, (e.target.value || null) as TDraft[keyof TDraft])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (submittingRef.current) return // ignore double-taps while a save is already in flight
    submittingRef.current = true
    setSubmitting(true)
    setSubmitError(null)
    try {
      // transform may upload an attachment (ExpenseForm receipt) and can reject; the
      // mutations can reject on network/RLS failure. Surface either instead of letting
      // the button silently flip back to idle.
      const payload = transform ? await transform(d) : d
      const saved = initial
        ? await update.mutateAsync({ id: initial.id, patch: payload })
        : await create.mutateAsync(payload)
      await onSaved?.(saved)
      onDone()
    } catch (err) {
      setSubmitError((err as Error)?.message || DEFAULT_ERROR)
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return { d, setD, set, busy, text, date, submit, submitError }
}
