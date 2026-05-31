import { useState } from 'react'
import { Plus, Trash2, Check, ListTodo } from 'lucide-react'
import type { ProjectTask } from '../../domain/types'
import type { ProjectTaskStatus } from '../../domain/enums'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { fmtDate } from '../../lib/date'
import { EditorSheet } from '../../components/ui/EditorSheet'
import { useEditor } from '../../components/ui/useEditor'
import { SearchField } from '../../components/ui/SearchField'
import { matchesQuery } from '../../lib/search'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { EmptyState, ListState } from '../../components/ui/Feedback'
import { useToast } from '../../components/ui/Toast'
import { useCurrentProject } from '../projects/currentProject'
import { useVendors } from '../vendors/useVendors'
import { useLineItems } from '../budget/useBudget'
import { useRestoreRow } from '../../data/hooks'
import { useTasks, useUpdateTask, useRemoveTask } from './useTasks'
import { TaskForm } from './TaskForm'
import { PunchWalkSheet } from './PunchWalkSheet'
import { ClipboardList } from 'lucide-react'

type Filter = 'all' | ProjectTaskStatus
const STATUS_TONE: Record<ProjectTaskStatus, BadgeTone> = {
  todo: 'neutral',
  inProgress: 'info',
  blocked: 'danger',
  done: 'success',
}
const STATUS_LABEL: Record<ProjectTaskStatus, string> = {
  todo: 'To do',
  inProgress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
}

export function TasksScreen() {
  const { projectId } = useCurrentProject()
  const { data: tasks = [], isLoading, error } = useTasks(projectId!)
  const { data: vendors = [] } = useVendors(projectId!)
  const { data: lineItems = [] } = useLineItems(projectId!)
  const update = useUpdateTask()
  const remove = useRemoveTask()
  const restore = useRestoreRow('project_tasks')
  const toast = useToast()
  const editor = useEditor<ProjectTask>()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [punchWalk, setPunchWalk] = useState(false)

  if (!projectId) return null

  const vendorName = (id: string | null) => vendors.find((v) => v.id === id)?.name
  const visible = tasks.filter(
    (t) => (filter === 'all' ? true : t.status === filter) && matchesQuery(q, t.title, t.notes, vendorName(t.vendorId)),
  )

  const toggleDone = (t: ProjectTask) => {
    const done = t.status === 'done'
    // Un-completing a task drops it back to in-progress (you were clearly working it),
    // not all the way to to-do.
    update.mutate({
      id: t.id,
      patch: { status: done ? 'inProgress' : 'done', completedAt: done ? null : new Date().toISOString() },
    })
  }
  const del = async (t: ProjectTask) => {
    await remove.mutateAsync(t.id)
    toast.success('Task moved to Trash', { action: { label: 'Undo', onClick: () => restore.mutate(t.id) } })
  }

  return (
    <section>
      <ScreenHeader
        title="Tasks"
        trailing={
          <span className="dash-header-actions">
            <Button size="sm" variant="ghost" leadingIcon={<ClipboardList size={15} />} onClick={() => setPunchWalk(true)}>
              Punch walk
            </Button>
            {tasks.length > 0 && (
              <Button size="sm" leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
                Add task
              </Button>
            )}
          </span>
        }
      />

      <ListState
        error={error}
        isLoading={isLoading}
        isEmpty={tasks.length === 0}
        errorLabel="Couldn’t load tasks"
        empty={
          <EmptyState
            icon={ListTodo}
            title="No tasks yet"
            body="Track to-dos, who's responsible, and what they tie back to in the budget."
            action={
              <Button leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
                Add task
              </Button>
            }
          />
        }
      >
        <div className="list-toolbar">
              <SegmentedControl<Filter>
                ariaLabel="Filter tasks"
                value={filter}
                onChange={setFilter}
                segments={[
                  { value: 'all', label: 'All' },
                  { value: 'todo', label: 'To do' },
                  { value: 'inProgress', label: 'Active' },
                  { value: 'done', label: 'Done' },
                ]}
              />
            </div>
            {tasks.length > 2 && <SearchField value={q} onChange={setQ} placeholder="Search title, notes, vendor" />}
            {visible.length === 0 ? (
              <p className="muted">No tasks match this filter or search.</p>
            ) : (
            <ul className="card-list">
              {visible.map((t) => (
                <li key={t.id} className="expense-row">
                  <button
                    className={`task-check${t.status === 'done' ? ' is-done' : ''}`}
                    onClick={() => toggleDone(t)}
                    aria-label={t.status === 'done' ? 'Mark not done' : 'Mark done'}
                  >
                    <Check size={16} aria-hidden />
                  </button>
                  <button className="expense-row-open" onClick={() => editor.openEdit(t)}>
                    <div className="expense-row-main">
                      <strong className={t.status === 'done' ? 'task-done-text' : undefined}>{t.title}</strong>
                      <span className="muted">
                        {vendorName(t.vendorId) ? `${vendorName(t.vendorId)} · ` : ''}
                        {t.dueDate ? `Due ${fmtDate(t.dueDate)}` : 'No due date'}
                      </span>
                    </div>
                    <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                  </button>
                  <button className="expense-row-del" onClick={() => del(t)} aria-label="Delete task">
                    <Trash2 size={17} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            )}
      </ListState>

      <EditorSheet editor={editor} newTitle="New task" editTitle="Edit task">
        {(initial) => (
          <TaskForm projectId={projectId} vendors={vendors} lineItems={lineItems} initial={initial} onDone={editor.close} />
        )}
      </EditorSheet>

      {punchWalk && <PunchWalkSheet projectId={projectId} onClose={() => setPunchWalk(false)} />}
    </section>
  )
}
