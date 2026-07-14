import { Fragment, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import '../../styles/workbench.css'

export type SortDirection = 'asc' | 'desc'

export interface SortState {
  key: string
  direction: SortDirection
}

export interface DataColumn<Row> {
  key: string
  header: ReactNode
  /** Short text repeated beside a value when the row reflows into a mobile card. */
  mobileLabel?: string
  cell: (row: Row) => ReactNode
  align?: 'start' | 'center' | 'end'
  sortable?: boolean
  className?: string
}

interface DataTableProps<Row> {
  caption: string
  rows: Row[]
  columns: DataColumn<Row>[]
  getRowKey: (row: Row) => string
  sort?: SortState
  onSort?: (next: SortState) => void
  rowClassName?: (row: Row) => string | undefined
  expandedRow?: (row: Row) => ReactNode
  isExpanded?: (row: Row) => boolean
}

/**
 * Shared finance-table foundation. It stays a semantic table at every breakpoint;
 * CSS reflows its cells into labelled card fields on narrow screens, so the same
 * content and controls remain available without horizontal scrolling.
 */
export function DataTable<Row>({
  caption,
  rows,
  columns,
  getRowKey,
  sort,
  onSort,
  rowClassName,
  expandedRow,
  isExpanded,
}: DataTableProps<Row>) {
  const updateSort = (key: string) => {
    if (!onSort) return
    onSort({
      key,
      direction: sort?.key === key && sort.direction === 'asc' ? 'desc' : 'asc',
    })
  }

  return (
    <div className="data-table-shell">
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const active = sort?.key === column.key
              const ariaSort = active
                ? sort.direction === 'asc'
                  ? 'ascending'
                  : 'descending'
                : undefined
              return (
                <th
                  key={column.key}
                  scope="col"
                  className={[
                    column.align === 'end' && 'cell-number',
                    column.align === 'center' && 'cell-center',
                    column.className,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-sort={ariaSort}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      className="table-sort"
                      onClick={() => updateSort(column.key)}
                    >
                      <span>{column.header}</span>
                      {active ? (
                        sort.direction === 'asc' ? (
                          <ArrowUp size={13} aria-hidden />
                        ) : (
                          <ArrowDown size={13} aria-hidden />
                        )
                      ) : (
                        <ChevronsUpDown size={13} aria-hidden />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = getRowKey(row)
            const open = isExpanded?.(row) ?? false
            return (
              <Fragment key={key}>
                <tr className={rowClassName?.(row)} data-expanded={open || undefined}>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      data-label={column.mobileLabel}
                      className={[
                        column.align === 'end' && 'cell-number',
                        column.align === 'center' && 'cell-center',
                        column.className,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
                {open && expandedRow && (
                  <tr className="data-table-expansion">
                    <td colSpan={columns.length}>{expandedRow(row)}</td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
