import { useId, type ReactNode } from 'react'

export interface FieldControlProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
}

/** Label + control + hint/error, with the aria wiring done for you. The control is
 *  a render prop so any input/select/textarea can be dropped in while keeping the
 *  label association (getByLabelText) and error semantics correct.
 *
 *  <Field label="Name" error={err}>{(p) => <input {...p} value={v} onChange={...} />}</Field>
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: (props: FieldControlProps) => ReactNode
}) {
  const id = useId()
  const hintId = hint && !error ? `${id}-hint` : undefined
  const errId = error ? `${id}-err` : undefined
  const describedBy = [errId, hintId].filter(Boolean).join(' ') || undefined

  return (
    <div className={`field${error ? ' field-invalid' : ''}`}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && !error && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
