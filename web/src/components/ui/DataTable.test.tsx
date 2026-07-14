// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { useMemo, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { DataTable, type DataColumn, type SortState } from './DataTable'

type Row = { id: string; vendor: string; amount: number }

const DATA: Row[] = [
  { id: '1', vendor: 'Framing Co', amount: 900 },
  { id: '2', vendor: 'Electric Co', amount: 1200 },
]

function Harness() {
  const [sort, setSort] = useState<SortState>({ key: 'vendor', direction: 'asc' })
  const rows = useMemo(
    () =>
      [...DATA].sort((a, b) => {
        const value = sort.key === 'amount' ? a.amount - b.amount : a.vendor.localeCompare(b.vendor)
        return value * (sort.direction === 'asc' ? 1 : -1)
      }),
    [sort],
  )
  const columns: DataColumn<Row>[] = [
    { key: 'vendor', header: 'Vendor', sortable: true, cell: (row) => row.vendor },
    { key: 'amount', header: 'Amount', mobileLabel: 'Amount', sortable: true, cell: (row) => row.amount },
  ]
  return (
    <DataTable
      caption="Invoice register"
      rows={rows}
      columns={columns}
      getRowKey={(row) => row.id}
      sort={sort}
      onSort={setSort}
    />
  )
}

describe('DataTable', () => {
  it('exposes semantic sorting and updates row order', () => {
    render(<Harness />)
    expect(screen.getByRole('table', { name: 'Invoice register' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Vendor' })).toHaveAttribute('aria-sort', 'ascending')

    fireEvent.click(screen.getByRole('button', { name: 'Amount' }))
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toHaveAttribute('aria-sort', 'ascending')
    const rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Framing Co')

    fireEvent.click(screen.getByRole('button', { name: 'Amount' }))
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toHaveAttribute('aria-sort', 'descending')
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Electric Co')
  })
})
