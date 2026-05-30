import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Camera, Images } from 'lucide-react'
import type { PhotoAttachment } from '../../domain/types'
import { PHASE_TAGS } from '../../domain/roomCatalog'
import { uploadBlob } from '../../lib/r2'
import { Field } from '../../components/ui/Field'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { Form } from '../../components/ui/Form'
import { useCreatePhoto, useUpdatePhoto } from './usePhotos'

type Draft = Partial<Omit<PhotoAttachment, 'id' | 'owner' | 'createdAt'>>

const blank = (projectId: string, room: string): Draft => ({
  projectId,
  imageObjectKey: null,
  roomTag: room,
  phaseTag: '',
  categoryName: '',
  budgetLineItemId: null,
  notes: '',
})

export function PhotoForm({
  projectId,
  rooms,
  categories,
  initial,
  onDone,
}: {
  projectId: string
  rooms: string[]
  categories: string[]
  initial?: PhotoAttachment
  onDone: () => void
}) {
  const [d, setD] = useState<Draft>(initial ?? blank(projectId, rooms[0] ?? 'General'))
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const onPick = (e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)
  const create = useCreatePhoto()
  const update = useUpdatePhoto()
  const busy = create.isPending || update.isPending

  const text = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    try {
      let imageObjectKey = d.imageObjectKey ?? null
      if (file) imageObjectKey = (await uploadBlob(file, 'photo')).key
      if (!imageObjectKey) {
        setErr('Choose a photo to upload')
        return
      }
      const payload: Draft = { ...d, projectId, imageObjectKey }
      if (initial) await update.mutateAsync({ id: initial.id, patch: payload })
      else await create.mutateAsync(payload)
      onDone()
    } catch (e2) {
      setErr((e2 as Error).message || 'Upload failed — photo storage may not be configured yet.')
    }
  }

  return (
    <Form onSubmit={submit}>
      <Form.Section>
        <div className={`field${err ? ' field-invalid' : ''}`}>
          <span className="field-label">Photo</span>
          {/* Two explicit choices. On mobile, "Take photo" opens the camera (capture) and
              "Photo library" opens the gallery/files (no capture, so it isn't forced to the
              camera). On desktop both open the file picker. */}
          <div className="upload-choices">
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label="Take a photo"
              onChange={onPick}
            />
            <input
              ref={libraryRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Choose a photo from your library"
              onChange={onPick}
            />
            <Button type="button" variant="secondary" leadingIcon={<Camera size={16} />} onClick={() => cameraRef.current?.click()}>
              Take photo
            </Button>
            <Button type="button" variant="secondary" leadingIcon={<Images size={16} />} onClick={() => libraryRef.current?.click()}>
              Photo library
            </Button>
          </div>
          {err && (
            <p className="field-error" role="alert">
              {err}
            </p>
          )}
        </div>
        {(file || d.imageObjectKey) && <p className="muted">{file ? file.name : 'Photo attached'}</p>}
        <div className="form-grid">
          <Field label="Room">
            {(p) => (
              <Select {...p} value={d.roomTag} onChange={text('roomTag')}>
                {rooms.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Phase">
            {(p) => (
              <Select {...p} value={d.phaseTag} onChange={text('phaseTag')}>
                <option value="">—</option>
                {PHASE_TAGS.map((ph) => (
                  <option key={ph} value={ph}>
                    {ph}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field
          label="Category"
          hint={categories.length === 0 ? 'No budget categories yet — add them in Budget to tag photos.' : undefined}
        >
          {(p) => (
            <Select {...p} value={d.categoryName} onChange={text('categoryName')}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Notes">{(p) => <textarea {...p} value={d.notes ?? ''} onChange={text('notes')} />}</Field>
      </Form.Section>
      <Form.Actions busy={busy} onCancel={onDone} saveLabel="Save photo" />
    </Form>
  )
}
