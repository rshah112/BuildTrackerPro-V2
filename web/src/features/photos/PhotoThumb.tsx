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
    let created: string | null = null
    signedDownloadUrl(objectKey)
      .then((u) => {
        if (!active) {
          if (u && u.startsWith('blob:')) URL.revokeObjectURL(u)
          return
        }
        if (u) {
          created = u
          setUrl(u)
        } else setFailed(true)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
      // Local mode returns an object URL; release it to avoid a leak.
      if (created && created.startsWith('blob:')) URL.revokeObjectURL(created)
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
