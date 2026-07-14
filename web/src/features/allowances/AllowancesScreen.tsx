import { useMemo, useState } from 'react'
import { Plus, Trash2, Sparkles } from 'lucide-react'
import type { AllowanceSelection } from '../../domain/types'
import { fmt } from '../../lib/money'
import { fmtDate } from '../../lib/date'
import { allowanceOverage } from '../../lib/budgetAggregates'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EditorSheet } from '../../components/ui/EditorSheet'
import { useEditor } from '../../components/ui/useEditor'
import { EmptyState, ListState } from '../../components/ui/Feedback'
import { SearchField } from '../../components/ui/SearchField'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Stat } from '../../components/ui/Stat'
import { useToast } from '../../components/ui/Toast'
import { useConfirm } from '../../components/ui/Confirm'
import { useCurrentProject } from '../projects/currentProject'
import { useLineItems } from '../budget/useBudget'
import { useSyncActuals } from '../budget/useSyncActuals'
import { useExpenses } from '../expenses/useExpenses'
import { useRestoreRow } from '../../data/hooks'
import { matchesQuery } from '../../lib/search'
import {
  allowanceOperationGroups,
  allowanceOperationSummary,
  type AllowanceOperationGroup,
} from '../operations/operationsSummary'
import { useAllowances, useRemoveAllowance } from './useAllowances'
import { AllowanceForm } from './AllowanceForm'
import '../operations/operations.css'

type Filter = 'all' | 'over' | 'within' | 'unselected' | 'review'

const EMPTY_ROWS: never[] = []

function upsert(list: AllowanceSelection[], item: AllowanceSelection): AllowanceSelection[] {
  return list.some((selection) => selection.id === item.id)
    ? list.map((selection) => (selection.id === item.id ? item : selection))
    : [...list, item]
}

function groupRank(group: AllowanceOperationGroup): number {
  if (group.source === 'unlinked' || group.source === 'reclassified') return 0
  if ((group.remaining ?? 0) < 0) return 1
  if (group.selections.length === 0) return 2
  return 3
}

export function AllowancesScreen() {
  const { projectId } = useCurrentProject()
  const lineItemsQuery = useLineItems(projectId!)
  const expensesQuery = useExpenses(projectId!)
  const selectionsQuery = useAllowances(projectId!)
  const lineItems = lineItemsQuery.data ?? EMPTY_ROWS
  const expenses = expensesQuery.data ?? EMPTY_ROWS
  const selections = selectionsQuery.data ?? EMPTY_ROWS
  const queries = [lineItemsQuery, expensesQuery, selectionsQuery]
  const isLoading = queries.some((query) => query.isLoading)
  const error = queries.find((query) => query.error)?.error
  const remove = useRemoveAllowance()
  const restore = useRestoreRow('allowance_selections')
  const syncActuals = useSyncActuals(projectId!)
  const toast = useToast()
  const confirm = useConfirm()
  const editor = useEditor<AllowanceSelection>()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')

  const allowanceLineItems = useMemo(() => lineItems.filter((lineItem) => lineItem.isAllowance), [lineItems])
  const groups = useMemo(
    () => allowanceOperationGroups(lineItems, selections, expenses),
    [lineItems, selections, expenses],
  )
  const summary = useMemo(() => allowanceOperationSummary(groups), [groups])
  const overage = useMemo(
    () => allowanceOverage(lineItems, selections, expenses),
    [lineItems, selections, expenses],
  )
  const counts = useMemo(
    () => ({
      over: groups.filter((group) => group.remaining !== null && group.remaining < 0).length,
      within: groups.filter(
        (group) => group.remaining !== null && group.source !== 'none' && group.remaining >= 0,
      ).length,
      unselected: groups.filter(
        (group) => group.remaining !== null && group.selections.length === 0,
      ).length,
      review: groups.filter(
        (group) => group.source === 'unlinked' || group.source === 'reclassified',
      ).length,
    }),
    [groups],
  )
  const visible = useMemo(
    () =>
      groups
        .filter((group) => {
          const filterMatch =
            filter === 'all' ||
            (filter === 'over' && group.remaining !== null && group.remaining < 0) ||
            (filter === 'within' && group.remaining !== null && group.source !== 'none' && group.remaining >= 0) ||
            (filter === 'unselected' &&
              group.remaining !== null &&
              group.selections.length === 0) ||
            (filter === 'review' &&
              (group.source === 'unlinked' || group.source === 'reclassified'))
          return (
            filterMatch &&
            matchesQuery(
              q,
              group.lineItem?.title,
              group.lineItem?.categoryName,
              group.lineItem?.costCode,
              ...group.selections.flatMap((selection) => [selection.vendor, selection.notes]),
            )
          )
        })
        .sort(
          (a, b) =>
            groupRank(a) - groupRank(b) ||
            (a.lineItem?.categoryName ?? '').localeCompare(b.lineItem?.categoryName ?? '') ||
            (a.lineItem?.title ?? a.id).localeCompare(b.lineItem?.title ?? b.id),
        ),
    [groups, filter, q],
  )

  if (!projectId) return null

  const reviewSelectionCount =
    summary.unlinkedSelectionCount + summary.reclassifiedSelectionCount

  const titleOf = (id: string) => {
    const lineItem = lineItems.find((item) => item.id === id)
    return lineItem ? `${lineItem.categoryName} / ${lineItem.title}` : 'Unlinked allowance'
  }
  const removeAndSync = async (selection: AllowanceSelection) => {
    if (
      !(await confirm({
        title: 'Delete selection?',
        message: `${titleOf(selection.lineItemId)} selection will be removed.`,
        destructive: true,
      }))
    )
      return
    await remove.mutateAsync(selection.id)
    await syncActuals({ allowanceSelections: selections.filter((item) => item.id !== selection.id) })
    toast.success('Allowance selection moved to Trash', {
      action: {
        label: 'Undo',
        onClick: async () => {
          await restore.mutateAsync(selection.id)
          await syncActuals({ allowanceSelections: selections })
        },
      },
    })
  }
  const resetView = () => {
    setQ('')
    setFilter('all')
  }

  return (
    <section className="operations-screen">
      <ScreenHeader
        title="Allowances"
        subtitle="Allowance limits compared with selections and linked expense activity"
        trailing={
          allowanceLineItems.length > 0 ? (
            <Button size="sm" leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
              Add selection
            </Button>
          ) : undefined
        }
      />

      <ListState
        error={error}
        isLoading={isLoading}
        isEmpty={allowanceLineItems.length === 0 && selections.length === 0}
        errorLabel="Couldn’t load allowances"
        empty={
          <EmptyState
            icon={Sparkles}
            title="No allowance line items"
            body="Mark a budget line item as an allowance in Budget first, then record finish selections here."
          />
        }
      >
        <>
          <div className="metric-grid operations-summary" aria-label="Allowance usage summary">
            <Stat
              label="Allowance pool"
              value={fmt(summary.allowance)}
              sub={`${summary.itemCount} allowance item${summary.itemCount === 1 ? '' : 's'}`}
            />
            <Stat label="Used" value={fmt(summary.used)} sub="Selections, otherwise linked expenses" />
            <Stat
              label="Available"
              value={fmt(summary.available)}
              sub={`${summary.unselectedCount} without a selection`}
            />
            <Stat
              label="Overage"
              value={fmt(overage)}
              sub={`${reviewSelectionCount} selection${reviewSelectionCount === 1 ? '' : 's'} need review`}
              tone={overage > 0 ? 'danger' : 'default'}
            />
          </div>

          <div className="operations-toolbar">
            <SearchField value={q} onChange={setQ} placeholder="Search allowance, category, vendor or notes" />
            <div className="operations-filter">
              <SegmentedControl<Filter>
                ariaLabel="Filter allowances"
                value={filter}
                onChange={setFilter}
                segments={[
                  { value: 'all', label: `All (${groups.length})` },
                  { value: 'over', label: `Over (${counts.over})` },
                  { value: 'within', label: `Within (${counts.within})` },
                  { value: 'unselected', label: `No selection (${counts.unselected})` },
                  { value: 'review', label: `Review (${counts.review})` },
                ]}
              />
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No allowances match this view"
              body="Clear the search or return to all allowances."
              action={<Button variant="secondary" onClick={resetView}>Clear filters</Button>}
            />
          ) : (
            <ul className="operations-list">
              {visible.map((group) => {
                const over = group.remaining !== null && group.remaining < 0
                const sourceCopy =
                  group.source === 'selections'
                    ? `${group.selections.length} selection${group.selections.length === 1 ? '' : 's'}`
                    : group.source === 'expenses'
                      ? 'Linked expenses; no selection recorded'
                      : group.source === 'unlinked'
                        ? `${group.selections.length} selection${group.selections.length === 1 ? '' : 's'} need a budget line`
                        : group.source === 'reclassified'
                          ? `${group.selections.length} selection${group.selections.length === 1 ? '' : 's'} tied to a non-allowance line`
                        : 'No selections or linked expenses'
                return (
                  <li key={group.id}>
                    <article className="operations-record">
                      <div className="allowance-record-head">
                        <span className="operations-record-title">
                          <strong>{group.lineItem?.title || 'Unlinked allowance selections'}</strong>
                          <span className="operations-record-meta">
                            {group.lineItem
                              ? `${group.lineItem.categoryName}${group.lineItem.costCode ? ` · ${group.lineItem.costCode}` : ''}`
                              : 'The original allowance line is unavailable'}
                          </span>
                        </span>
                        <span className="operations-record-badges">
                          {group.source === 'unlinked' ? (
                            <Badge tone="danger">Needs budget line</Badge>
                          ) : group.source === 'reclassified' ? (
                            <Badge tone="warn">No longer an allowance</Badge>
                          ) : over ? (
                            <Badge tone="danger">{fmt(Math.abs(group.remaining!))} over</Badge>
                          ) : group.source === 'none' ? (
                            <Badge tone="neutral">Not selected</Badge>
                          ) : (
                            <Badge tone="success">{fmt(group.remaining!)} available</Badge>
                          )}
                        </span>
                      </div>

                      <dl className="operations-impact-grid" aria-label={`${group.lineItem?.title || 'Unlinked allowance'} comparison`}>
                        <div>
                          <dt>Allowance</dt>
                          <dd>{group.allowance === null ? '—' : fmt(group.allowance)}</dd>
                        </div>
                        <div>
                          <dt>Used</dt>
                          <dd>
                            {fmt(group.used)}
                            <small>{sourceCopy}</small>
                          </dd>
                        </div>
                        <div>
                          <dt>Remaining</dt>
                          <dd className={over ? 'operations-money-danger' : undefined}>
                            {group.remaining === null
                              ? group.source === 'reclassified'
                                ? 'Not applicable'
                                : 'Needs link'
                              : over
                                ? `${fmt(Math.abs(group.remaining))} over`
                                : fmt(group.remaining)}
                          </dd>
                        </div>
                      </dl>

                      {group.selections.length === 0 ? (
                        <p className="operations-empty-note">
                          {group.source === 'expenses'
                            ? 'No selection record yet; the used amount comes from linked expenses.'
                            : 'No selections recorded for this allowance.'}
                        </p>
                      ) : (
                        <ul className="allowance-selection-list" aria-label="Recorded selections">
                          {group.selections.map((selection) => (
                            <li className="allowance-selection-row" key={selection.id}>
                              <button
                                type="button"
                                className="allowance-selection-open"
                                onClick={() => editor.openEdit(selection)}
                                aria-label={`Edit ${selection.vendor || 'allowance'} selection for ${fmt(selection.amount)}`}
                              >
                                <span className="allowance-selection-main">
                                  <strong>{selection.vendor || 'Selection'}</strong>
                                  <strong className="tnum">{fmt(selection.amount)}</strong>
                                </span>
                                <span className="allowance-selection-meta">
                                  Selected {fmtDate(selection.selectionDate)}
                                  {selection.notes ? ` · ${selection.notes}` : ''}
                                </span>
                              </button>
                              <Button
                                size="sm"
                                variant="ghost"
                                leadingIcon={<Trash2 size={15} />}
                                aria-label={`Delete ${selection.vendor || 'allowance'} selection for ${fmt(selection.amount)}`}
                                onClick={() => removeAndSync(selection)}
                              >
                                Remove
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      </ListState>

      <EditorSheet editor={editor} newTitle="New allowance selection" editTitle="Edit allowance selection">
        {(initial) => (
          <AllowanceForm
            projectId={projectId}
            lineItems={allowanceLineItems}
            initial={initial}
            onSaved={async (saved) => {
              await syncActuals({ allowanceSelections: upsert(selections, saved) })
              toast.success('Allowance selection saved')
            }}
            onPostSaveError={() =>
              toast.error('Selection saved, but budget totals could not refresh. Reopen Budget to reconcile them.')
            }
            onDone={editor.close}
          />
        )}
      </EditorSheet>
    </section>
  )
}
