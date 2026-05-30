import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { signedDownloadUrl } from '../../lib/r2'

/** Resolves a signed/object URL for an R2 object key and renders the image. */
export function PhotoThumb({ objectKey, alt }: { objectKey: string | null; alt: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!objectKey) return
    let active = true
    signedDownloadUrl(objectKey)
      .then((u) => {
        if (!active) return
        if (u) setUrl(u)
        else setFailed(true)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [objectKey])

  if (!objectKey || failed) {
    return (
      <div className="photo-thumb photo-thumb-missing" aria-label={alt}>
        <ImageOff size={22} aria-hidden />
      </div>
    )
  }
  if (!url) return <div className="photo-thumb skeleton" aria-hidden />
  return <img className="photo-thumb" src={url} alt={alt} loading="lazy" />
}
