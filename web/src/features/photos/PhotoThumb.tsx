import { ImageOff } from 'lucide-react'
import { usePhotoUrl } from './usePhotoUrl'

/** Resolves a signed/object URL for an R2 object key and renders the image. The URL is
 *  fetched through a react-query cache keyed by objectKey, so repeated thumbnails and
 *  re-navigations reuse one signed URL instead of re-signing on every mount. */
export function PhotoThumb({ objectKey, alt }: { objectKey: string | null; alt: string }) {
  const { data: url, isLoading, isError } = usePhotoUrl(objectKey)

  if (!objectKey || isError || (!isLoading && !url)) {
    return (
      <div className="photo-thumb photo-thumb-missing" aria-label={alt}>
        <ImageOff size={22} aria-hidden />
      </div>
    )
  }
  if (!url) return <div className="photo-thumb skeleton" aria-hidden />
  return <img className="photo-thumb" src={url} alt={alt} loading="lazy" />
}
