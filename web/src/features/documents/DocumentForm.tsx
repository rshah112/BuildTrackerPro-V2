import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { BudgetLineItem, ProjectDocument } from '../../domain/types'
import { PROJECT_DOCUMENT_KINDS, PROJECT_DOCUMENT_STATUSES, type ProjectDocumentKind } from '../../domain/enums'
import { uploadBlob } from '../../lib/r2'
import { Field } from '../../components/ui/Field'
import { Select } from '../../components/ui/Select'
import { FileUploadField } from '../../components/ui/FileUploadField'
import { Form } from '../../components/ui/Form'
import { useCreateDocument, useUpdateDocument, DOCUMENT_KIND_LABEL } from './useDocuments'

type Draft = Partial<Omit<ProjectDocument, 'id' | 'owner'>>

const STATUS_LABEL: Record<(typeof PROJECT_DOCUMENT_STATUSES)[number], string> = {
  required: 'Required',
  received: 'Received',
  missing: 'Missing',
}

const blank = (projectId: string, kind: ProjectDocumentKind): Draft => ({
  projectId,
  fileName: '',
  kind,
  status: 'received',
  notes: '',
  budgetLineItemId: null,
  budgetLineItemTitle: '',
  fileObjectKey: null,
})

export function DocumentForm({
  projectId,
  lineItems,
  initialKind = 'other',
  initial,
  onDone,
}: {
  projectId: string
  lineItems: BudgetLineItem[]
  initialKind?: ProjectDocumentKind
  initial?: ProjectDocument
  onDone: () => void
}) {
  const [d, setD] = useState<Draft>(initial ?? blank(projectId, initialKind))
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const create = useCreateDocument()
  const update = useUpdateDocument()
  const busy = create.isPending || update.isPending

  const text = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value }))

  const chooseLineItem = (e: ChangeEvent<HTMLSelectElement>) => {
    const item = lineItems.find((li) => li.id === e.target.value)
    setD((p) => ({ ...p, budgetLineItemId: item?.id ?? null, budgetLineItemTitle: item?.title ?? '' }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    try {
      let fileObjectKey = d.fileObjectKey ?? null
      let fileName = d.fileName ?? ''
      if (file) {
        fileObjectKey = (await uploadBlob(file, 'document')).key
        if (!fileName.trim()) fileName = file.name
      }
      if (!fileObjectKey) {
        setErr('Choose a file to upload')
        return
      }
      const payload: Draft = { ...d, projectId, fileObjectKey, fileName: fileName.trim() || 'Document' }
      if (initial) await update.mutateAsync({ id: initial.id, patch: payload })
      else await create.mutateAsync(payload)
      onDone()
    } catch (e2) {
      setErr((e2 as Error).message || 'Upload failed — document storage may not be configured yet.')
    }
  }

  return (
    <Form onSubmit={submit}>
      <Form.Section>
        <FileUploadField
          label="File"
          error={err ?? undefined}
          cameraAccept="image/*"
          cameraLabel="Take photo"
          fileAccept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
          fileLabel="Choose file"
          onPick={setFile}
        />
        {(file || d.fileObjectKey) && <p className="muted">{file ? file.name : d.fileName || 'File attached'}</p>}
        <Field label="Display name" hint="Optional — defaults to the uploaded file name.">
          {(p) => <input {...p} value={d.fileName ?? ''} onChange={text('fileName')} />}
        </Field>
        <div className="form-grid">
          <Field label="Type">
            {(p) => (
              <Select {...p} value={d.kind} onChange={text('kind')}>
                {PROJECT_DOCUMENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {DOCUMENT_KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Status">
            {(p) => (
              <Select {...p} value={d.status} onChange={text('status')}>
                {PROJECT_DOCUMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field
          label="Budget item"
          hint={lineItems.length === 0 ? 'Optional. No budget line items yet — add them in Budget.' : 'Optional'}
        >
          {(p) => (
            <Select {...p} value={d.budgetLineItemId ?? ''} onChange={chooseLineItem}>
              <option value="">None</option>
              {lineItems.map((li) => (
                <option key={li.id} value={li.id}>
                  {li.categoryName} / {li.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Notes">{(p) => <textarea {...p} value={d.notes ?? ''} onChange={text('notes')} />}</Field>
      </Form.Section>
      <Form.Actions busy={busy} onCancel={onDone} saveLabel="Save document" />
    </Form>
  )
}
