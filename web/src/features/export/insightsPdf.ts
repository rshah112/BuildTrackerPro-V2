import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { diff, fmt, sumBy } from '../../lib/money'
import { actualSpend, committedSpend } from '../../lib/budgetAggregates'
import { lineItemHealth } from '../../lib/budgetMath'
import { nextFourteenDaysDue, localToday } from '../cashflow/cashFlow'
import { loadProjectExport, downloadBlob, safeFileName } from './exportData'

export async function downloadInsightsPdf(projectId: string): Promise<void> {
  const d = await loadProjectExport(projectId)
  const doc = new jsPDF()
  const margin = 14
  let y = 18

  doc.setFontSize(20)
  doc.text(d.project.name || 'Project report', margin, y)
  y += 7
  doc.setFontSize(10)
  doc.setTextColor(120)
  doc.text(
    [d.project.address, `Status: ${d.project.status}`, `Generated ${d.exportedAt.slice(0, 10)}`]
      .filter(Boolean)
      .join('   •   '),
    margin,
    y,
  )
  doc.setTextColor(0)
  y += 8

  const budgetTotal = sumBy(d.lineItems, (li) => li.budget)
  // Same basis as the Dashboard so the report reconciles (see workbook.ts).
  const actualTotal = actualSpend(d.lineItems, d.expenses, d.allowanceSelections, d.changeOrders)
  const committedTotal = committedSpend(d.lineItems, d.changeOrders)
  const limit = d.project.constructionBudget + d.project.contingencyBudget
  const usedPct = limit > 0 ? Math.round((actualTotal / limit) * 100) : 0

  autoTable(doc, {
    startY: y,
    theme: 'plain',
    body: [
      ['Construction budget', fmt(d.project.constructionBudget)],
      ['Contingency', fmt(d.project.contingencyBudget)],
      ['Line-item budget total', fmt(budgetTotal)],
      ['Actual to date', fmt(actualTotal)],
      ['Committed', fmt(committedTotal)],
      ['Variance (actual − budget)', fmt(diff(actualTotal, budgetTotal))],
      ['Budget used', `${usedPct}%`],
      ['Due next 14 days', fmt(nextFourteenDaysDue(d.expenses, d.changeOrders, localToday()))],
    ],
    styles: { fontSize: 10 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 } },
  })

  // Spend by category
  const cats = d.categories.map((c) => {
    const items = d.lineItems.filter((li) => li.categoryName === c.name)
    return {
      name: c.name,
      budget: sumBy(items, (li) => li.budget),
      actual: sumBy(items, (li) => li.actual),
    }
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const afterSummary = (doc as any).lastAutoTable?.finalY ?? y + 10
  doc.setFontSize(13)
  doc.text('Budget by category', margin, afterSummary + 10)
  autoTable(doc, {
    startY: afterSummary + 13,
    head: [['Category', 'Budget', 'Actual', 'Variance']],
    body: cats.map((c) => [
      c.name,
      fmt(c.budget),
      fmt(c.actual),
      fmt(diff(c.actual, c.budget)),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [194, 65, 12] },
  })

  const overBudget = d.lineItems.filter((li) => lineItemHealth(li) === 'overBudget')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const afterCats = (doc as any).lastAutoTable?.finalY ?? afterSummary + 20
  doc.setFontSize(13)
  doc.text('Attention', margin, afterCats + 10)
  doc.setFontSize(10)
  doc.text(
    [
      `${overBudget.length} line item(s) over budget`,
      `${d.expenses.filter((e) => !e.isPaid).length} open expense(s)`,
      `${d.changeOrders.filter((c) => c.status === 'pending').length} pending change order(s)`,
    ].join('\n'),
    margin,
    afterCats + 17,
  )

  downloadBlob(doc.output('blob'), `${safeFileName(d.project.name)}-report-${d.exportedAt.slice(0, 10)}.pdf`)
}
