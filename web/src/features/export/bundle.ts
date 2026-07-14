import { signedDownloadUrl } from '../../lib/r2'
import { makeZip, type ZipEntry } from '../../lib/zip'
import { BACKUP_VERSION } from './backup'
import { downloadBlob, loadProjectExport, safeFileName, type ProjectExport } from './exportData'
import { workbookBuffer } from './workbook'

const MAX_ARCHIVE_MEDIA_BYTES = 250 * 1024 * 1024

interface MediaRef {
  key: string
  path: string
}

interface MediaManifestRow extends MediaRef {
  contentType: string
  sizeBytes: number
}

function cleanPathPart(value: string): string {
  const printable = Array.from(value, (char) => (char.charCodeAt(0) < 32 ? '-' : char)).join('')
  return printable.replace(/[\\/:*?"<>|]+/g, '-').replace(/^\.+|\.+$/g, '').slice(0, 100) || 'file'
}

function mediaRefs(data: ProjectExport): MediaRef[] {
  const refs: MediaRef[] = []
  const add = (key: string | null | undefined, folder: string, name: string) => {
    if (key) refs.push({ key, path: `media/${folder}/${cleanPathPart(name)}` })
  }

  data.expenses.forEach((row) =>
    add(row.receiptObjectKey, 'receipts', `${row.date}-${row.vendorName || 'receipt'}-${row.id}`),
  )
  data.photos.forEach((row) =>
    add(row.imageObjectKey, 'photos', `${row.createdAt.slice(0, 10)}-${row.roomTag || 'photo'}-${row.id}`),
  )
  data.documents.forEach((row) => add(row.fileObjectKey, 'documents', row.fileName || row.id))
  data.bids.forEach((row) => add(row.fileObjectKey, 'bids', row.fileName || row.id))
  data.allowanceSelections.forEach((row) =>
    add(row.photoObjectKey, 'allowances', `${row.selectionDate}-${row.vendor || 'selection'}-${row.id}`),
  )

  // A blob referenced in multiple places is stored once. Keep the first friendly path.
  return Array.from(new Map(refs.map((ref) => [ref.key, ref])).values())
}

function extensionFor(contentType: string): string {
  if (contentType.includes('jpeg')) return '.jpg'
  if (contentType.includes('png')) return '.png'
  if (contentType.includes('webp')) return '.webp'
  if (contentType.includes('heic')) return '.heic'
  if (contentType.includes('pdf')) return '.pdf'
  return '.bin'
}

async function loadMedia(data: ProjectExport): Promise<{ entries: ZipEntry[]; manifest: MediaManifestRow[] }> {
  const refs = mediaRefs(data)
  const entries = new Array<ZipEntry>(refs.length)
  const manifest = new Array<MediaManifestRow>(refs.length)
  let cursor = 0
  let totalBytes = 0

  const worker = async () => {
    while (cursor < refs.length) {
      const index = cursor++
      const ref = refs[index]
      const url = await signedDownloadUrl(ref.key)
      if (!url) throw new Error(`A recovery-bundle file is missing (${ref.path})`)
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Could not include ${ref.path} (${response.status})`)
      const dataBytes = new Uint8Array(await response.arrayBuffer())
      totalBytes += dataBytes.length
      if (totalBytes > MAX_ARCHIVE_MEDIA_BYTES) {
        throw new Error('Project media exceeds the 250 MB browser bundle limit; use JSON backup plus individual files')
      }
      const contentType = response.headers.get('content-type') || 'application/octet-stream'
      const hasExtension = /\.[a-z0-9]{1,8}$/i.test(ref.path)
      const archivePath = hasExtension ? ref.path : `${ref.path}${extensionFor(contentType)}`
      entries[index] = { name: archivePath, data: dataBytes }
      manifest[index] = { ...ref, path: archivePath, contentType, sizeBytes: dataBytes.length }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, refs.length) }, worker))
  return { entries, manifest }
}

/** Download a portable recovery archive: full data (including trash), workbook,
 *  every referenced media object, and a manifest that maps object keys to files. */
export async function downloadBundle(projectId: string): Promise<void> {
  const [full, report] = await Promise.all([
    loadProjectExport(projectId, { trashed: 'all' }),
    loadProjectExport(projectId),
  ])
  const base = safeFileName(full.project.name)
  const date = full.exportedAt.slice(0, 10)
  const json = JSON.stringify({ backupVersion: BACKUP_VERSION, ...full }, null, 2)
  const { entries: media, manifest } = await loadMedia(full)
  const manifestJson = JSON.stringify(
    {
      exportedAt: full.exportedAt,
      project: full.project.name,
      files: manifest,
      note: 'The JSON backup retains R2 object keys; media/ contains portable copies of those objects.',
    },
    null,
    2,
  )

  const zip = makeZip([
    { name: `${base}-backup-${date}.json`, data: new TextEncoder().encode(json) },
    { name: `${base}-${date}.xlsx`, data: new Uint8Array(workbookBuffer(report)) },
    { name: 'media-manifest.json', data: new TextEncoder().encode(manifestJson) },
    ...media,
  ])
  downloadBlob(zip, `${base}-recovery-${date}.zip`)
}
