import { useRef, type ChangeEvent, type ReactNode } from 'react'
import { Camera, Images, Paperclip } from 'lucide-react'
import { Button } from './Button'

/** A labelled file picker that offers an optional "Take photo" (camera) button alongside a
 *  "Choose file"/"Photo library" button. The camera button sets `capture` so mobile opens
 *  the camera; the file button has no `capture` so it opens the gallery/files (not forced
 *  to the camera). Shared by Photos, Receipts (expenses) and Documents. */
export function FileUploadField({
  label,
  error,
  hint,
  fileAccept,
  fileLabel = 'Choose file',
  fileIcon,
  cameraAccept,
  cameraLabel = 'Take photo',
  onPick,
}: {
  label: string
  error?: string
  hint?: string
  /** accept for the gallery/files button. */
  fileAccept: string
  fileLabel?: string
  fileIcon?: ReactNode
  /** when set, also show a camera button with this accept + capture. */
  cameraAccept?: string
  cameraLabel?: string
  onPick: (file: File | null) => void
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const pick = (e: ChangeEvent<HTMLInputElement>) => onPick(e.target.files?.[0] ?? null)

  return (
    <div className={`field${error ? ' field-invalid' : ''}`}>
      <span className="field-label">{label}</span>
      <div className="upload-choices">
        {cameraAccept && (
          <>
            <input
              ref={cameraRef}
              type="file"
              accept={cameraAccept}
              capture="environment"
              className="sr-only"
              aria-label={cameraLabel}
              onChange={pick}
            />
            <Button type="button" variant="secondary" leadingIcon={<Camera size={16} />} onClick={() => cameraRef.current?.click()}>
              {cameraLabel}
            </Button>
          </>
        )}
        <input ref={fileRef} type="file" accept={fileAccept} className="sr-only" aria-label={fileLabel} onChange={pick} />
        <Button
          type="button"
          variant="secondary"
          leadingIcon={fileIcon ?? (cameraAccept ? <Images size={16} /> : <Paperclip size={16} />)}
          onClick={() => fileRef.current?.click()}
        >
          {fileLabel}
        </Button>
      </div>
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
