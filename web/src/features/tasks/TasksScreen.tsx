import { useState } from 'react'
import { Plus, Trash2, Check, ListTodo } from 'lucide-react'
import type { ProjectTask } from '../../domain/types'
import type { ProjectTaskStatus } from '../../domain/enums'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Sheet } from '../../components/ui/Sheet'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { EmptyState, ListSkeleton } from '../../components/ui/Feedback'
import { useToast } from '../../components/ui/Toast'
import { useCurrentProject } from '../projects/currentProject'
import { useVendors } from '../vendors/useVendors'
import { useLineItems } from '../budget/useBudget'
import { useTasks, useUpdateTask, useRemoveTask } from './useTasks'
import { TaskForm } from './TaskForm'

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
  const toast = useToast()
  const [editing, setEditing] = useState<ProjectTask | 'new' | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  if (!projectId) return null

  const visible = tasks.filter((t) => (filter === 'all' ? true : t.status === filter))
  const vendorName = (id: string | null) => vendors.find((v) => v.id === id)?.name

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
    toast.success('Task deleted')
  }

  return (
    <section>
      <ScreenHeader
        title="Tasks"
        trailing={
          tasks.length > 0 ? (
            <Button size="sm" leadingIcon={<Plus size={16} />} onClick={() => setEditing('new')}>
              Add task
            </Button>
          ) : undefined
        }
      />

      {error && <p role="alert">Couldn’t load tasks: {(error as Error).message}</p>}
      {isLoading && <ListSkeleton />}

      {!isLoading && tasks.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="No tasks yet"
          body="Track to-dos, who's responsible, and what they tie back to in the budget."
          action={
            <Button leadingIcon={<Plus size={16} />} onClick={() => setEditing('new')}>
              Add task
            </Button>
          }
        />
      ) : (
        !isLoading && (
          <>
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
                  <button className="expense-row-open" onClick={() => setEditing(t)}>
                    <div className="expense-row-main">
                      <strong className={t.status === 'done' ? 'task-done-text' : undefined}>{t.title}</strong>
                      <span className="muted">
                        {vendorName(t.vendorId) ? `${vendorName(t.vendorId)} · ` : ''}
                        {t.dueDate ? `Due ${new Date(t.dueDate).toLocaleDateString()}` : 'No due date'}
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
          </>
        )
      )}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New task' : 'Edit task'}
      >
        {editing !== null && (
          <TaskForm
            projectId={projectId}
            vendors={vendors}
            lineItems={lineItems}
            initial={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </section>
  )
}
