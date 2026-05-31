import { useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, Landmark } from 'lucide-react'
import type { LoanDraw } from '../../domain/types'
import { fmt } from '../../lib/money'
import { fmtDate } from '../../lib/date'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { Stat } from '../../components/ui/Stat'
import { SectionCard } from '../../components/ui/SectionCard'
import { Sheet } from '../../components/ui/Sheet'
import { EmptyState, ListState } from '../../components/ui/Feedback'
import { EditorSheet } from '../../components/ui/EditorSheet'
import { useEditor } from '../../components/ui/useEditor'
import { useToast } from '../../components/ui/Toast'
import { useConfirm } from '../../components/ui/Confirm'
import { useRestoreRow } from '../../data/hooks'
import { useCurrentProject } from '../projects/currentProject'
import { useLoan, useLoanDraws, useRemoveDraw } from './useLoan'
import { LoanForm } from './LoanForm'
import { DrawForm } from './DrawForm'
import { availableCredit, drawnTotal, interestAccruedToDate, monthlyInterest, utilization } from './loanMath'

export function LoanScreen() {
  const { projectId } = useCurrentProject()
  const { data: loans = [], isLoading, error } = useLoan(projectId!)
  const { data: allDraws = [] } = useLoanDraws(projectId!)
  const removeDraw = useRemoveDraw()
  const restoreDraw = useRestoreRow('loan_draws')
  const toast = useToast()
  const confirm = useConfirm()
  const editor = useEditor<LoanDraw>()
  const [editingLoan, setEditingLoan] = useState(false)

  const loan = loans[0]
  // Only this loan's draws — guards against orphaned draws from a previously-deleted loan
  // on the same project polluting the balance/interest math.
  const draws = useMemo(() => allDraws.filter((dr) => dr.loanId === loan?.id), [allDraws, loan])

  const m = useMemo(() => {
    if (!loan) return null
    const drawn = drawnTotal(draws)
    return {
      drawn,
      available: availableCredit(loan.totalAmount, draws),
      util: Math.round(utilization(loan.totalAmount, draws) * 100),
      monthly: monthlyInterest(drawn, loan.interestRate),
      accrued: interestAccruedToDate(draws, loan.interestRate, new Date()),
    }
  }, [loan, draws])

  const sortedDraws = useMemo(() => [...draws].sort((a, b) => b.drawDate.localeCompare(a.drawDate)), [draws])

  const delDraw = async (dr: LoanDraw) => {
    if (!(await confirm({ title: 'Delete draw?', message: `${fmt(dr.amount)} draw will be moved to Trash.`, destructive: true }))) return
    await removeDraw.mutateAsync(dr.id)
    toast.success('Draw moved to Trash', { action: { label: 'Undo', onClick: () => restoreDraw.mutate(dr.id) } })
  }

  if (!projectId) return null

  return (
    <section>
      <ScreenHeader
        title="Construction loan"
        subtitle="Optional — track your facility, draws and interest-only payments"
        trailing={
          loan ? (
            <Button size="sm" variant="ghost" leadingIcon={<Pencil size={15} />} onClick={() => setEditingLoan(true)}>
              Edit
            </Button>
          ) : undefined
        }
      />

      <ListState
        error={error}
        isLoading={isLoading}
        isEmpty={!loan}
        errorLabel="Couldn’t load the loan"
        empty={
          <EmptyState
            icon={Landmark}
            title="No construction loan"
            body="If this project is financed, set up the loan to track draws against your facility and your monthly interest-only payment."
            action={
              <Button leadingIcon={<Plus size={16} />} onClick={() => setEditingLoan(true)}>
                Set up loan
              </Button>
            }
          />
        }
      >
        {loan && m && (
          <>
            <div className="metric-grid compact">
              <Stat label="Loan amount" value={fmt(loan.totalAmount)} sub={loan.lender || undefined} />
              <Stat label="Drawn" value={fmt(m.drawn)} sub={`${m.util}% used`} />
              <Stat label="Available" value={fmt(m.available)} tone={m.available <= 0 ? 'danger' : 'default'} />
            </div>

            <SectionCard title="Interest (interest-only)">
              <div className="progress thin">
                <span className={m.util >= 100 ? 'fill-danger' : 'fill-brand'} style={{ width: `${Math.min(100, m.util)}%` }} />
              </div>
              <div className="kv-row">
                <span className="muted">Rate</span>
                <span>{loan.interestRate}% / yr</span>
              </div>
              <div className="kv-row">
                <span className="muted">Monthly payment (on amount drawn)</span>
                <strong className="tnum">{fmt(m.monthly)}</strong>
              </div>
              <div className="kv-row">
                <span className="muted">Interest accrued to date (est.)</span>
                <span className="tnum">{fmt(m.accrued)}</span>
              </div>
            </SectionCard>

            <div className="list-toolbar">
              <h2 className="section-label" style={{ margin: 0 }}>
                Draws
              </h2>
              <Button size="sm" leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
                Add draw
              </Button>
            </div>

            {sortedDraws.length === 0 ? (
              <EmptyState icon={Landmark} title="No draws yet" body="Record each draw you take against the loan." />
            ) : (
              <ul className="card-list">
                {sortedDraws.map((dr) => (
                  <li key={dr.id} className="expense-row">
                    <button className="expense-row-open" onClick={() => editor.openEdit(dr)}>
                      <div className="expense-row-main">
                        <strong>{dr.description || 'Draw'}</strong>
                        <span className="muted">{fmtDate(dr.drawDate)}</span>
                      </div>
                      <strong className="tnum">{fmt(dr.amount)}</strong>
                    </button>
                    <button className="expense-row-del" onClick={() => delDraw(dr)} aria-label="Delete draw">
                      <Trash2 size={17} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </ListState>

      {/* Loan setup / edit (single row per project). */}
      <Sheet open={editingLoan} onClose={() => setEditingLoan(false)} title={loan ? 'Edit loan' : 'Set up loan'}>
        {editingLoan && <LoanForm projectId={projectId} initial={loan} onDone={() => setEditingLoan(false)} />}
      </Sheet>

      {loan && (
        <EditorSheet editor={editor} newTitle="Add draw" editTitle="Edit draw">
          {(initial) => <DrawForm projectId={projectId} loanId={loan.id} initial={initial} onDone={editor.close} />}
        </EditorSheet>
      )}
    </section>
  )
}
