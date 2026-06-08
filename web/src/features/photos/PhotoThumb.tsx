import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import { usePhotoUrl } from './usePhotoUrl'

/** Resolves a signed/object URL for an R2 object key and renders the image. The URL is
 *  fetched through a react-query cache keyed by objectKey, so repeated thumbnails and
 *  re-navigations reuse one signed URL instead of re-signing on every mount. */
export function PhotoThumb({ objectKey, alt }: { objectKey: string | null; alt: string }) {
  const { data: url, isLoading, isError } = usePhotoUrl(objectKey)
  // A non-image file (e.g. a PDF receipt) resolves a URL fine but can't render in <img> — show
  // the icon fallback instead of a broken-image glyph. Tracking the failed URL auto-resets when
  // the URL changes (no effect needed).
  const [erroredUrl, setErroredUrl] = useState<string | null>(null)

  if (!objectKey || isError || (!!url && erroredUrl === url) || (!isLoading && !url)) {
    return (
      <div className="photo-thumb photo-thumb-missing" aria-label={alt}>
        <ImageOff size={22} aria-hidden />
      </div>
    )
  }
  if (!url) return <div className="photo-thumb skeleton" aria-hidden />
  return <img className="photo-thumb" src={url} alt={alt} loading="lazy" onError={() => setErroredUrl(url)} />
}
