import { useState } from 'react'
import { Plus, Trash2, Camera, Pencil } from 'lucide-react'
import type { PhotoAttachment } from '../../domain/types'
import { roomsForTemplate } from '../../domain/roomCatalog'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { SearchField } from '../../components/ui/SearchField'
import { matchesQuery } from '../../lib/search'
import { EditorSheet } from '../../components/ui/EditorSheet'
import { useEditor } from '../../components/ui/useEditor'
import { FilePreview } from '../../components/ui/FilePreview'
import { EmptyState, ListSkeleton } from '../../components/ui/Feedback'
import { useToast } from '../../components/ui/Toast'
import { useCurrentProject } from '../projects/currentProject'
import { useProjects } from '../projects/useProjects'
import { useCategories } from '../budget/useBudget'
import { useRestoreRow } from '../../data/hooks'
import { usePhotos, useRemovePhoto } from './usePhotos'
import { PhotoThumb } from './PhotoThumb'
import { PhotoForm } from './PhotoForm'

export function PhotosScreen() {
  const { projectId } = useCurrentProject()
  const { data: photos = [], isLoading, error } = usePhotos(projectId!)
  const { data: projects = [] } = useProjects()
  const { data: categories = [] } = useCategories(projectId!)
  const remove = useRemovePhoto()
  const restore = useRestoreRow('photo_attachments')
  const toast = useToast()
  const editor = useEditor<PhotoAttachment>()
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState<PhotoAttachment | null>(null)

  if (!projectId) return null

  if (error)
    return (
      <section>
        <ScreenHeader title="Photos" />
        <p role="alert" className="error-banner">
          Couldn’t load photos: {(error as Error).message}
        </p>
      </section>
    )

  const project = projects.find((p) => p.id === projectId)
  const rooms = roomsForTemplate(project?.templateType ?? 'customHome')
  const catNames = categories.map((c) => c.name)

  const visible = photos.filter((ph) => matchesQuery(q, ph.notes, ph.roomTag, ph.phaseTag, ph.categoryName))
  const byRoom = new Map<string, PhotoAttachment[]>()
  for (const ph of visible) {
    const room = ph.roomTag || 'General'
    byRoom.set(room, [...(byRoom.get(room) ?? []), ph])
  }
  const orderedRooms = [...byRoom.keys()].sort()

  const del = async (ph: PhotoAttachment) => {
    await remove.mutateAsync(ph.id)
    toast.success('Photo moved to Trash', { action: { label: 'Undo', onClick: () => restore.mutate(ph.id) } })
  }

  return (
    <section>
      <ScreenHeader
        title="Photos"
        trailing={
          photos.length > 0 ? (
            <Button size="sm" leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
              Add photo
            </Button>
          ) : undefined
        }
      />

      {isLoading && <ListSkeleton />}

      {!isLoading && photos.length > 2 && (
        <SearchField value={q} onChange={setQ} placeholder="Search notes, room, phase, category" />
      )}

      {!isLoading && photos.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="No photos yet"
          body="Document the build by room and phase. Each photo can tie to a budget category."
          action={
            <Button leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
              Add photo
            </Button>
          }
        />
      ) : orderedRooms.length === 0 ? (
        <p className="muted">No photos match “{q}”.</p>
      ) : (
        orderedRooms.map((room) => (
          <div key={room}>
            <h2 className="section-label">{room}</h2>
            <div className="photo-grid">
              {byRoom.get(room)!.map((ph) => (
                <div key={ph.id} className="photo-cell">
                  <button
                    className="photo-open"
                    onClick={() => setPreview(ph)}
                    aria-label={`Preview photo: ${ph.notes || room}`}
                  >
                    <PhotoThumb objectKey={ph.imageObjectKey} alt={ph.notes || room} />
                  </button>
                  <button className="photo-del" onClick={() => del(ph)} aria-label="Delete photo">
                    <Trash2 size={15} aria-hidden />
                  </button>
                  {ph.phaseTag && <span className="photo-phase">{ph.phaseTag}</span>}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <FilePreview
        open={!!preview}
        onClose={() => setPreview(null)}
        objectKey={preview?.imageObjectKey ?? null}
        title={preview?.notes || preview?.roomTag || 'Photo'}
        footer={
          preview ? (
            <div className="row-between">
              <Button
                variant="secondary"
                leadingIcon={<Pencil size={16} />}
                onClick={() => {
                  const ph = preview
                  setPreview(null)
                  editor.openEdit(ph)
                }}
              >
                Edit details
              </Button>
              <Button
                variant="ghost"
                leadingIcon={<Trash2 size={16} />}
                onClick={() => {
                  const ph = preview
                  setPreview(null)
                  void del(ph)
                }}
              >
                Delete
              </Button>
            </div>
          ) : undefined
        }
      />

      <EditorSheet editor={editor} newTitle="Add photo" editTitle="Edit photo">
        {(initial) => (
          <PhotoForm projectId={projectId} rooms={rooms} categories={catNames} initial={initial} onDone={editor.close} />
        )}
      </EditorSheet>
    </section>
  )
}
