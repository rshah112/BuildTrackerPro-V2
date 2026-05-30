import { useRows, useCreateRow, useUpdateRow, useRemoveRow } from '../../data/hooks'
import type { PhotoAttachment } from '../../domain/types'

const TABLE = 'photo_attachments'

export const usePhotos = (projectId: string) => useRows<PhotoAttachment>(TABLE, { projectId })
export const useCreatePhoto = () => useCreateRow<PhotoAttachment>(TABLE)
export const useUpdatePhoto = () => useUpdateRow<PhotoAttachment>(TABLE)
export const useRemovePhoto = () => useRemoveRow(TABLE)
