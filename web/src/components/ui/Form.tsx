import type { FormEvent, ReactNode } from 'react'
import { Button } from './Button'

/** Compound form scaffold shared by every entity form. Renders the established `.form`
 *  markup so existing styling/tests are unaffected:
 *
 *    <Form onSubmit={submit}>
 *      <Form.Section>…fields…</Form.Section>
 *      <Form.Actions busy={busy} onCancel={onDone} saveLabel="Save expense" />
 *    </Form>
 */
export function Form({ onSubmit, children }: { onSubmit: (e: FormEvent) => void; children: ReactNode }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      {children}
    </form>
  )
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="form-section">
      {title && <h3 className="form-section-title">{title}</h3>}
      {children}
    </div>
  )
}

/** Sticky submit/cancel footer. `saveLabel`/`cancelLabel` default to "Save"/"Cancel"
 *  (the accessible names the e2e specs match on). */
function Actions({
  busy = false,
  onCancel,
  saveLabel = 'Save',
  cancelLabel = 'Cancel',
}: {
  busy?: boolean
  onCancel: () => void
  saveLabel?: string
  cancelLabel?: string
}) {
  return (
    <div className="form-actions form-actions-sticky">
      <Button type="submit" loading={busy} fullWidth>
        {saveLabel}
      </Button>
      <Button type="button" variant="secondary" onClick={onCancel}>
        {cancelLabel}
      </Button>
    </div>
  )
}

Form.Section = Section
Form.Actions = Actions
