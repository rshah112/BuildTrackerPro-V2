import { useQuery } from '@tanstack/react-query'
import { signedDownloadUrl } from '../../lib/r2'

// Resolve an R2 object key to a viewable URL, cached by key so a grid of thumbnails
// (and re-navigations that remount them) reuse one signed URL instead of re-signing per
// mount. Signed URLs are time-limited, so we refresh well inside their validity window.
export function usePhotoUrl(objectKey: string | null) {
  return useQuery({
    queryKey: ['photoUrl', objectKey],
    queryFn: () => signedDownloadUrl(objectKey as string),
    enabled: !!objectKey,
    staleTime: 50 * 60_000, // signed URLs last ~1h; re-sign after 50 min
    gcTime: 60 * 60_000,
    retry: 1,
  })
}
