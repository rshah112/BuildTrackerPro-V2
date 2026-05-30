import { useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, FolderOpen, FileText } from 'lucide-react'
import type { ProjectDocument } from '../../domain/types'
import { PROJECT_DOCUMENT_KINDS, type ProjectDocumentKind } from '../../domain/enums'
import { fmtDate } from '../../lib/date'
import { signedDownloadUrl } from '../../lib/r2'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Stat } from '../../components/ui/Stat'
import { SectionCard } from '../../components/ui/SectionCard'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { EmptyState, ListState } from '../../components/ui/Feedback'
import { EditorSheet } from '../../components/ui/EditorSheet'
import { useEditor } from '../../components/ui/useEditor'
import { useToast } from '../../components/ui/Toast'
import { useConfirm } from '../../components/ui/Confirm'
import { useCurrentProject } from '../projects/currentProject'
import { useLineItems } from '../budget/useBudget'
import { useDocuments, useRemoveDocument, DOCUMENT_KIND_LABEL, REQUIRED_DOCUMENT_KINDS } from './useDocuments'
import { DocumentForm } from './DocumentForm'

type Filter = 'all' | 'received' | 'missing'
const STATUS_TONE: Record<ProjectDocument['status'], BadgeTone> = {
  received: 'success',
  required: 'warn',
  missing: 'danger',
}
const STATUS_LABEL: Record<ProjectDocument['status'], string> = {
  received: 'Received',
  required: 'Required',
  missing: 'Missing',
}

export function DocumentsScreen() {
  const { projectId } = useCurrentProject()
  const { data: documents = [], isLoading, error } = useDocuments(projectId!)
  const { data: lineItems = [] } = useLineItems(projectId!)
  const remove = useRemoveDocument()
  const toast = useToast()
  const confirm = useConfirm()
  const editor = useEditor<ProjectDocument>()
  const [newKind, setNewKind] = useState<ProjectDocumentKind>('other')
  const [filter, setFilter] = useState<Filter>('all')

  const receivedKinds = useMemo(
    () => new Set(documents.filter((d) => d.status === 'received').map((d) => d.kind)),
    [documents],
  )
  const missingRequired = REQUIRED_DOCUMENT_KINDS.filter((k) => !receivedKinds.has(k))

  const visible = documents.filter((d) =>
    filter === 'all' ? true : filter === 'received' ? d.status === 'received' : d.status === 'missing',
  )
  // Group the visible docs by kind, in the canonical kind order.
  const byKind = PROJECT_DOCUMENT_KINDS.map((kind) => ({
    kind,
    docs: visible.filter((d) => d.kind === kind),
  })).filter((g) => g.docs.length > 0)

  const openNewWithKind = (kind: ProjectDocumentKind) => {
    setNewKind(kind)
    editor.openNew()
  }

  const openFile = async (doc: ProjectDocument) => {
    if (!doc.fileObjectKey) return
    try {
      const url = await signedDownloadUrl(doc.fileObjectKey)
      if (url) window.open(url, '_blank', 'noopener')
    } catch {
      toast.error('Couldn’t open the file')
    }
  }

  const del = async (doc: ProjectDocument) => {
    if (!(await confirm({ title: 'Delete document?', message: `${doc.fileName} will be removed.`, destructive: true }))) return
    await remove.mutateAsync(doc.id)
    toast.success('Document deleted')
  }

  if (!projectId) return null

  return (
    <section>
      <ScreenHeader
        title="Documents"
        subtitle="Surveys, permits, plans, contracts and closeout files"
        trailing={
          documents.length > 0 ? (
            <Button size="sm" leadingIcon={<Plus size={16} />} onClick={() => openNewWithKind('other')}>
              Upload
            </Button>
          ) : undefined
        }
      />

      {documents.length > 0 && (
        <div className="metric-grid compact">
          <Stat label="Files" value={documents.length} />
          <Stat label="Uploaded" value={documents.filter((d) => d.status === 'received').length} />
          <Stat
            label="Missing"
            value={missingRequired.length}
            tone={missingRequired.length > 0 ? 'danger' : 'default'}
          />
        </div>
      )}

      <SectionCard title="Required checklist" trailing={`${REQUIRED_DOCUMENT_KINDS.length - missingRequired.length}/${REQUIRED_DOCUMENT_KINDS.length}`}>
        <ul className="stat-list">
          {REQUIRED_DOCUMENT_KINDS.map((kind) => {
            const have = receivedKinds.has(kind)
            return (
              <li key={kind} className="kv-row">
                <span className={have ? undefined : 'danger-text'}>
                  {have ? '✓ ' : '• '}
                  {DOCUMENT_KIND_LABEL[kind]}
                </span>
                <Button size="sm" variant="ghost" onClick={() => openNewWithKind(kind)}>
                  {have ? 'Add another' : 'Upload'}
                </Button>
              </li>
            )
          })}
        </ul>
      </SectionCard>

      {documents.length > 0 && (
        <div className="list-toolbar">
          <SegmentedControl<Filter>
            ariaLabel="Filter documents"
            value={filter}
            onChange={setFilter}
            segments={[
              { value: 'all', label: 'All' },
              { value: 'received', label: 'Uploaded' },
              { value: 'missing', label: 'Missing' },
            ]}
          />
        </div>
      )}

      <ListState
        error={error}
        isLoading={isLoading}
        isEmpty={documents.length === 0}
        errorLabel="Couldn’t load documents"
        empty={
          <EmptyState
            icon={FolderOpen}
            title="No documents yet"
            body="Upload surveys, permits, plans, contracts, insurance and receipts to keep them with the project."
            action={
              <Button leadingIcon={<Plus size={16} />} onClick={() => openNewWithKind('other')}>
                Upload
              </Button>
            }
          />
        }
      >
        {byKind.length === 0 ? (
          <EmptyState icon={FolderOpen} title="Nothing here" body="No documents match this filter." />
        ) : (
          byKind.map(({ kind, docs }) => (
            <div key={kind}>
              <h2 className="section-label">{DOCUMENT_KIND_LABEL[kind]}</h2>
              <ul className="card-list">
                {docs.map((doc) => (
                  <li key={doc.id} className="expense-row">
                    <button className="expense-row-open" onClick={() => openFile(doc)}>
                      <div className="expense-row-main">
                        <strong>
                          <FileText size={14} aria-hidden style={{ verticalAlign: '-2px', marginRight: 4 }} />
                          {doc.fileName}
                        </strong>
                        <span className="muted">
                          {fmtDate(doc.uploadedAt)}
                          {doc.budgetLineItemTitle ? ` · ${doc.budgetLineItemTitle}` : ''}
                        </span>
                      </div>
                      <Badge tone={STATUS_TONE[doc.status]}>{STATUS_LABEL[doc.status]}</Badge>
                    </button>
                    <button className="expense-row-del" onClick={() => editor.openEdit(doc)} aria-label="Edit document">
                      <Pencil size={16} aria-hidden />
                    </button>
                    <button className="expense-row-del" onClick={() => del(doc)} aria-label="Delete document">
                      <Trash2 size={17} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </ListState>

      <EditorSheet editor={editor} newTitle="Upload document" editTitle="Edit document">
        {(initial) => (
          <DocumentForm
            projectId={projectId}
            lineItems={lineItems}
            initialKind={newKind}
            initial={initial}
            onDone={editor.close}
          />
        )}
      </EditorSheet>
    </section>
  )
}
