import * as XLSX from 'xlsx'
import { lineItemHealth, variance } from '../../lib/budgetMath'
import { diff, sumBy } from '../../lib/money'
import { effectiveAmountPaid } from '../../lib/expenseMath'
import { cashFlowPayments } from '../cashflow/cashFlow'
import { loadProjectExport, downloadBlob, safeFileName, type ProjectExport } from './exportData'

const dateOnly = (v?: string | null) => (v ? v.slice(0, 10) : '')

function buildWorkbook(d: ProjectExport): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const liTitle = new Map(d.lineItems.map((li) => [li.id, `${li.categoryName} / ${li.title}`]))
  const vendorName = new Map(d.vendors.map((v) => [v.id, v.name]))
  const pkgTitle = new Map(d.bidPackages.map((p) => [p.id, p.scopeTitle]))

  const budgetTotal = sumBy(d.lineItems, (li) => li.budget)
  const actualTotal = sumBy(d.lineItems, (li) => li.actual)
  const committedTotal = sumBy(d.lineItems, (li) => li.committed)

  const summary = XLSX.utils.aoa_to_sheet([
    ['Project', d.project.name],
    ['Address', d.project.address],
    ['Status', d.project.status],
    ['Square footage', d.project.squareFootage ?? ''],
    ['Stories', d.project.stories],
    [],
    ['Construction budget', d.project.constructionBudget],
    ['Contingency budget', d.project.contingencyBudget],
    ['Line-item budget total', budgetTotal],
    ['Actual to date', actualTotal],
    ['Committed', committedTotal],
    ['Variance (actual − budget)', diff(actualTotal, budgetTotal)],
    [],
    ['Categories', d.categories.length],
    ['Line items', d.lineItems.length],
    ['Expenses', d.expenses.length],
    ['Change orders', d.changeOrders.length],
    ['Vendors', d.vendors.length],
    ['Tasks', d.tasks.length],
    ['Bid packages', d.bidPackages.length],
    ['Exported', d.exportedAt],
  ])
  XLSX.utils.book_append_sheet(wb, summary, 'Summary')

  const append = (name: string, rows: Record<string, unknown>[]) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{}]), name)

  append('Categories', d.categories.map((c) => ({
    Category: c.name,
    'Target budget': c.targetBudget,
    'Line items': d.lineItems.filter((li) => li.categoryName === c.name).length,
  })))

  append('Line Items', d.lineItems.map((li) => ({
    Category: li.categoryName,
    Title: li.title,
    'Cost code': li.costCode,
    Budget: li.budget,
    Actual: li.actual,
    Committed: li.committed,
    Variance: variance(li),
    Health: lineItemHealth(li),
    Allowance: li.isAllowance ? 'Yes' : '',
  })))

  append('Expenses', d.expenses.map((e) => ({
    Vendor: e.vendorName,
    Amount: e.amount,
    Paid: effectiveAmountPaid(e),
    'Invoice #': e.invoiceNumber,
    Date: dateOnly(e.date),
    'Due date': dateOnly(e.dueDate),
    Category: e.categoryName,
    'Budget line': e.budgetLineItemTitle,
    Status: e.isPaid ? 'Paid' : 'Open',
  })))

  append('Change Orders', d.changeOrders.map((o) => ({
    Title: o.title,
    Amount: o.amount,
    Status: o.status,
    Category: o.categoryName,
    'Budget line': o.budgetLineItemTitle,
    'Expected payment': dateOnly(o.expectedPaymentDate),
  })))

  append('Allowances', d.allowanceSelections.map((a) => ({
    'Line item': liTitle.get(a.lineItemId) ?? a.lineItemId,
    Amount: a.amount,
    Vendor: a.vendor,
    Date: dateOnly(a.selectionDate),
    Notes: a.notes,
  })))

  append('Vendors', d.vendors.map((v) => ({
    Name: v.name,
    Trade: v.trade,
    Phone: v.phone,
    Email: v.email,
    Notes: v.notes,
  })))

  append('Tasks', d.tasks.map((t) => ({
    Title: t.title,
    Status: t.status,
    'Due date': dateOnly(t.dueDate),
    Vendor: vendorName.get(t.vendorId ?? '') ?? '',
    'Budget line': liTitle.get(t.budgetLineItemId ?? '') ?? '',
  })))

  append('Bids', d.bids.map((b) => ({
    Package: pkgTitle.get(b.packageId) ?? '',
    Vendor: b.vendorName,
    Amount: b.amount,
    Awarded: b.awardedAt ? 'Yes' : '',
  })))

  const cf = cashFlowPayments(d.expenses, d.changeOrders, new Date().toISOString())
  append('Cash Flow (14d)', cf.map((p) => ({
    Date: p.expectedDate,
    Item: p.title,
    Detail: p.subtitle,
    Exposure: p.exposure,
    Amount: p.amount,
  })))

  return wb
}

export async function downloadWorkbook(projectId: string): Promise<void> {
  const d = await loadProjectExport(projectId)
  const wb = buildWorkbook(d)
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  downloadBlob(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${safeFileName(d.project.name)}-${d.exportedAt.slice(0, 10)}.xlsx`,
  )
}
