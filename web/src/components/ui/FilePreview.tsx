import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { signedDownloadUrl } from '../../lib/r2'
import { Modal } from './Sheet'

const IMG_RE = /\.(png|jpe?g|gif|webp|heic|heif|bmp|avif|svg)$/i
const PDF_RE = /\.pdf$/i

/** Previews an R2-stored file in a centered modal: images render inline, PDFs in an iframe,
 *  anything else falls back to an open/download link. Used for documents, receipts, and
 *  photos (an image, no fileName). Shares the signed-URL query cache with thumbnails
 *  (`['photoUrl', key]`). In a standalone PWA `window.open(_blank)` is unreliable, so an
 *  in-app preview is the dependable way to view a file on tap. */
export function FilePreview({
  open,
  onClose,
  objectKey,
  title,
  fileName,
  autoFallback = false,
  footer,
}: {
  open: boolean
  onClose: () => void
  objectKey: string | null
  title?: string
  /** Drives the renderer (image vs pdf vs other). Omit for photos (treated as an image). */
  fileName?: string
  /** For files of unknown type (e.g. receipts — image OR PDF, no stored extension): try the
   *  image renderer first, then fall back to the PDF iframe if the image can't load. */
  autoFallback?: boolean
  footer?: ReactNode
}) {
  const { data: url, isLoading, isError } = useQuery({
    queryKey: ['photoUrl', objectKey],
    queryFn: () => signedDownloadUrl(objectKey as string),
    enabled: open && !!objectKey,
    staleTime: 50 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  })

  // For unknown-type files, optimistically render as an image and fall back to the PDF iframe
  // if it can't load. Tracking the failed key (not a bool) auto-resets when the file changes.
  const [failedKey, setFailedKey] = useState<string | null>(null)

  const isPdf = (!!fileName && PDF_RE.test(fileName)) || (autoFallback && failedKey === objectKey)
  const isImage = !isPdf && (!fileName || IMG_RE.test(fileName))

  return (
    <Modal open={open} onClose={onClose} title={title} footer={footer}>
      {!objectKey ? (
        <p className="muted">No file attached.</p>
      ) : isError ? (
        <p className="error-banner" role="alert">
          Couldn’t load the file.
        </p>
      ) : isLoading || !url ? (
        <div className="preview-loading skeleton" aria-hidden />
      ) : isImage ? (
        <img
          className="preview-img"
          src={url}
          alt={title || fileName || 'Preview'}
          onError={autoFallback ? () => setFailedKey(objectKey) : undefined}
        />
      ) : isPdf ? (
        <iframe className="preview-frame" src={url} title={title || fileName || 'Document'} />
      ) : (
        <p className="muted">Preview isn’t available for this file type — open it to view.</p>
      )}
      {url && (
        <a className="preview-open" href={url} target="_blank" rel="noopener">
          Open in new tab ↗
        </a>
      )}
    </Modal>
  )
}
