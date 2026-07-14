import { supabase } from './supabase'
import { objectKeyFor } from './objectKey'

// Blob pipeline. Production: ask /api/r2-sign for a presigned URL, then transfer the
// bytes straight to R2 (they never touch Postgres). Dev (VITE_R2_LOCAL=1): keep blobs
// in memory and hand back object URLs so photo flows work without an R2 account.

export interface UploadResult {
  key: string
}

function isLocal(): boolean {
  return import.meta.env.VITE_R2_LOCAL === '1'
}

const localBlobs = new Map<string, Blob>()
const MAX_BLOB_BYTES = 50 * 1024 * 1024

async function authHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return `Bearer ${data.session?.access_token ?? ''}`
}

export async function uploadBlob(file: Blob, entity: string): Promise<UploadResult> {
  if (file.size < 1) throw new Error('The selected file is empty')
  if (file.size > MAX_BLOB_BYTES) throw new Error('Files must be 50 MB or smaller')
  if (isLocal()) {
    const key = objectKeyFor('local', entity, crypto.randomUUID())
    localBlobs.set(key, file)
    return { key }
  }
  const contentType = file.type || 'application/octet-stream'
  const signRes = await fetch('/api/r2-sign', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: await authHeader() },
    body: JSON.stringify({ op: 'put', entity, contentType, contentLength: file.size }),
  })
  if (!signRes.ok) throw new Error(`r2 sign failed: ${signRes.status}`)
  const { url, key } = (await signRes.json()) as { url: string; key: string }

  const putRes = await fetch(url, { method: 'PUT', body: file, headers: { 'content-type': contentType } })
  if (!putRes.ok) throw new Error(`r2 upload failed: ${putRes.status}`)
  return { key }
}

export async function signedDownloadUrl(key: string): Promise<string> {
  if (isLocal()) {
    const blob = localBlobs.get(key)
    return blob ? URL.createObjectURL(blob) : ''
  }
  const res = await fetch('/api/r2-sign', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: await authHeader() },
    body: JSON.stringify({ op: 'get', key }),
  })
  if (!res.ok) throw new Error(`r2 sign(get) failed: ${res.status}`)
  const { url } = (await res.json()) as { url: string }
  return url
}

/** Permanently remove an object owned by the signed-in user. */
export async function deleteBlob(key: string): Promise<void> {
  if (isLocal()) {
    localBlobs.delete(key)
    return
  }
  const res = await fetch('/api/r2-sign', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: await authHeader() },
    body: JSON.stringify({ op: 'delete', key }),
  })
  if (!res.ok) throw new Error(`r2 delete failed: ${res.status}`)
}
