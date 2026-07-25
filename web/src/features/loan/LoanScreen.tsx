import { useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, Landmark, AlertTriangle, HandCoins } from 'lucide-react'
import type { DrawDisbursement, LoanDraw } from '../../domain/types'
import { cents, fmt, sumBy } from '../../lib/money'
import { fmtDate } from '../../lib/date'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { Stat } from '../../components/ui/Stat'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { SectionCard } from '../../components/ui/SectionCard'
import { Sheet } from '../../components/ui/Sheet'
import { EmptyState, ListState } from '../../components/ui/Feedback'
import { EditorSheet } from '../../components/ui/EditorSheet'
import { useEditor } from '../../components/ui/useEditor'
import { useToast } from '../../components/ui/Toast'
import { useConfirm } from '../../components/ui/Confirm'
import { useRestoreRow } from '../../data/hooks'
import { useCurrentProject } from '../projects/currentProject'
import { useExpenses } from '../expenses/useExpenses'
import { useVendors } from '../vendors/useVendors'
import { useLoan, useLoanDraws, useRemoveDraw } from './useLoan'
import { useAllocations, useDisbursements, useRemoveDisbursement } from './useTreasury'
import { LoanForm } from './LoanForm'
import { DrawForm } from './DrawForm'
import { DisbursementForm } from './DisbursementForm'
import {
  availableCredit,
  drawnTotal,
  fundedDraws,
  interestAccruedToDate,
  maturityStatus,
  monthlyInterest,
  projectInterest,
  resolvedMaturity,
  utilization,
  daysToMaturity,
} from './loanMath'
import {
  activeAllocations,
  cashOnHand,
  disbursedFromDraw,
  disbursementSummary,
  drawNetFunded,
  owedSummary,
  undisbursedFromDraw,
} from './treasury'
import { DRAW_STATUS_LABEL, type DrawStatus } from '../../domain/enums'

const EMPTY_ROWS: never[] = []

const STATUS_TONE: Record<DrawStatus, BadgeTone> = {
  requested: 'neutral',
  approved: 'info',
  funded: 'success',
}

export function LoanScreen() {
  const { projectId } = useCurrentProject()
  const loansQuery = useLoan(projectId!)
  const drawsQuery = useLoanDraws(projectId!)
  const expensesQuery = useExpenses(projectId!)
  const disbursementsQuery = useDisbursements(projectId!)
  const allocationsQuery = useAllocations(projectId!)
  const vendorsQuery = useVendors(projectId!)
  const loans = loansQuery.data ?? EMPTY_ROWS
  const allDraws = drawsQuery.data ?? EMPTY_ROWS
  const expenses = expensesQuery.data ?? EMPTY_ROWS
  const allDisbursements = disbursementsQuery.data ?? EMPTY_ROWS
  const allocations = allocationsQuery.data ?? EMPTY_ROWS
  const vendors = vendorsQuery.data ?? EMPTY_ROWS
  const queries = [loansQuery, drawsQuery, expensesQuery, disbursementsQuery, allocationsQuery]
  const isLoading = queries.some((query) => query.isLoading)
  const error = queries.find((query) => query.error)?.error
  const removeDraw = useRemoveDraw()
  const removeDisbursement = useRemoveDisbursement()
  const restoreDraw = useRestoreRow('loan_draws')
  const restoreDisbursement = useRestoreRow('draw_disbursements')
  const toast = useToast()
  const confirm = useConfirm()
  const editor = useEditor<LoanDraw>()
  const disbursementEditor = useEditor<DrawDisbursement>()
  // Which draw "Pay from this draw" was tapped on. Without it every payment would default
  // to the first funded draw, so paying out of draw #2 would quietly debit draw #1.
  const [payFromDrawId, setPayFromDrawId] = useState<string | undefined>(undefined)
  const [editingLoan, setEditingLoan] = useState(false)

  const loan = loans[0]
  // Only this loan's draws — guards against orphaned draws from a previously-deleted loan
  // on the same project polluting the balance/interest math.
  const draws = useMemo(() => allDraws.filter((dr) => dr.loanId === loan?.id), [allDraws, loan])
  const drawIds = useMemo(() => new Set(draws.map((dr) => dr.id)), [draws])
  const disbursements = useMemo(
    () => allDisbursements.filter((db) => drawIds.has(db.drawId)),
    [allDisbursements, drawIds],
  )
  // Only funded draws have moved money, so only they count toward balance and interest.
  const funded = useMemo(() => fundedDraws(draws), [draws])
  // Allocation rows outlive a soft-deleted payment, so scope them to live disbursements —
  // otherwise trashing a payment leaves the expenses it settled looking reimbursed.
  const liveAllocations = useMemo(
    () => activeAllocations(allocations, disbursements),
    [allocations, disbursements],
  )

  const m = useMemo(() => {
    if (!loan) return null
    const today = new Date()
    const drawn = drawnTotal(funded)
    const basis = loan.interestBasis ?? 'actual/365'
    const projection = projectInterest(loan, funded, today)
    const monthly = monthlyInterest(drawn, loan.interestRate)
    const onHand = cashOnHand(draws, disbursements)
    return {
      drawn,
      available: availableCredit(loan.totalAmount, funded),
      util: Math.round(utilization(loan.totalAmount, funded) * 100),
      monthly,
      accrued: interestAccruedToDate(funded, loan.interestRate, today, basis),
      projection,
      onHand,
      // The stated plan: interest comes out of leftover draw cash when there is any.
      interestCoveredByDrawCash: cents(onHand) >= cents(monthly) && monthly > 0,
      pipeline: sumBy(
        draws.filter((dr) => (dr.status ?? 'funded') !== 'funded'),
        (dr) => dr.amount,
      ),
      maturity: resolvedMaturity(loan),
      maturityState: maturityStatus(loan, today),
      daysLeft: daysToMaturity(loan, today),
    }
  }, [loan, draws, funded, disbursements])

  const owed = useMemo(() => owedSummary(expenses, liveAllocations), [expenses, liveAllocations])

  const sortedDraws = useMemo(
    () => [...draws].sort((a, b) => b.drawDate.localeCompare(a.drawDate)),
    [draws],
  )

  const delDraw = async (dr: LoanDraw) => {
    if (!(await confirm({ title: 'Delete draw?', message: `${fmt(dr.amount)} draw will be moved to Trash.`, destructive: true }))) return
    try {
      await removeDraw.mutateAsync(dr.id)
      toast.success('Draw moved to Trash', { action: { label: 'Undo', onClick: () => restoreDraw.mutate(dr.id) } })
    } catch (err) {
      // The database refuses to trash a draw whose cash has already been paid out.
      toast.error(err instanceof Error ? err.message : 'Couldn’t delete this draw')
    }
  }

  const delDisbursement = async (db: DrawDisbursement) => {
    if (!(await confirm({ title: 'Delete payment?', message: `${fmt(db.amount)} to ${db.partyName || 'this party'} will be moved to Trash. Your budget is not affected.`, destructive: true }))) return
    await removeDisbursement.mutateAsync(db.id)
    toast.success('Payment moved to Trash', {
      action: { label: 'Undo', onClick: () => restoreDisbursement.mutate(db.id) },
    })
  }

  if (!projectId) return null

  return (
    <section>
      <ScreenHeader
        title="Construction loan"
        subtitle="Facility, draws, and the cash you pay out of them"
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
            body="If this project is financed, set up the loan to track draws against your facility, your interest-only payments, and the reimbursements you pay out of each draw."
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
            {(m.maturityState === 'approaching' || m.maturityState === 'due' || m.maturityState === 'past') && (
              <SectionCard tone="danger" title={<><AlertTriangle size={16} aria-hidden /> Maturity</>}>
                <p className="panel-lead">
                  {m.maturityState === 'past'
                    ? `This loan matured on ${fmtDate(m.maturity)}.`
                    : `Matures ${fmtDate(m.maturity)} — ${m.daysLeft} days away.`}{' '}
                  Refinancing or extending a construction loan takes months; start now.
                </p>
              </SectionCard>
            )}

            <div className="metric-grid compact">
              <Stat label="Loan amount" value={fmt(loan.totalAmount)} sub={loan.lender || undefined} />
              <Stat label="Drawn" value={fmt(m.drawn)} sub={`${m.util}% of facility`} />
              <Stat label="Available" value={fmt(m.available)} tone={m.available <= 0 ? 'danger' : 'default'} />
              <Stat
                label="Cash on hand"
                value={fmt(m.onHand)}
                sub="Draw money not yet paid out"
              />
            </div>

            <SectionCard
              title="Terms"
              footnote={
                loan.termMonths
                  ? `${loan.termMonths}-month interest-only term${m.maturity ? `, maturing ${fmtDate(m.maturity)}` : ''}.`
                  : 'Add the closing date and term to see maturity and total carrying cost.'
              }
            >
              <div className="kv-row">
                <span className="muted">Rate</span>
                <span>{loan.interestRate}% / yr · {loan.interestBasis ?? 'actual/365'}</span>
              </div>
              <div className="kv-row">
                <span className="muted">Closing date</span>
                <span>{loan.startDate ? fmtDate(loan.startDate) : 'Not closed yet'}</span>
              </div>
              {(loan.originationFee ?? 0) > 0 && (
                <div className="kv-row">
                  <span className="muted">Origination / closing fee</span>
                  <span className="tnum">{fmt(loan.originationFee ?? 0)}</span>
                </div>
              )}
              {(loan.interestReserveAmount ?? 0) > 0 && (
                <div className="kv-row">
                  <span className="muted">Interest reserve held</span>
                  <span className="tnum">{fmt(loan.interestReserveAmount ?? 0)}</span>
                </div>
              )}
              <div className="progress thin">
                <span className={m.util >= 100 ? 'fill-danger' : 'fill-brand'} style={{ width: `${Math.min(100, m.util)}%` }} />
              </div>
            </SectionCard>

            <SectionCard
              title="Interest (interest-only)"
              footnote="Projection assumes the undrawn facility is taken evenly across the remaining months. Log each interest payment as an expense on “Construction loan interest” so it counts as a real project cost."
            >
              <div className="kv-row">
                <span className="muted">This month, on the current balance</span>
                <strong className="tnum">{fmt(m.monthly)}</strong>
              </div>
              {m.projection.peakMonthlyInterest > 0 && (
                <div className="kv-row">
                  <span className="muted">Peak monthly payment (projected)</span>
                  <span className="tnum">{fmt(m.projection.peakMonthlyInterest)}</span>
                </div>
              )}
              <div className="kv-row">
                <span className="muted">Accrued to date (est.)</span>
                <span className="tnum">{fmt(m.accrued)}</span>
              </div>
              {m.projection.totalInterest > 0 && (
                <>
                  <div className="kv-row">
                    <span className="muted">Still to come</span>
                    <span className="tnum">{fmt(m.projection.remainingInterest)}</span>
                  </div>
                  <div className="kv-row">
                    <span className="muted">
                      <strong>Total carrying cost over the term</strong>
                    </span>
                    <strong className="tnum">{fmt(m.projection.totalInterest)}</strong>
                  </div>
                </>
              )}
              {m.monthly > 0 && (
                <p className="panel-lead">
                  {m.interestCoveredByDrawCash
                    ? `Next payment can come out of the ${fmt(m.onHand)} of draw cash on hand.`
                    : `Draw cash on hand (${fmt(m.onHand)}) won’t cover the next payment — plan to pay it personally.`}
                </p>
              )}
            </SectionCard>

            <SectionCard
              title="Who is owed right now"
              footnote="Reimbursing yourself or the builder moves cash only — the cost was already counted when the expense was logged, so your budget doesn’t change."
            >
              <div className="kv-row">
                <span className="muted">
                  You fronted {fmt(owed.you.fronted)}
                  {owed.you.reimbursed > 0 && ` · ${fmt(owed.you.reimbursed)} repaid`}
                </span>
                <strong className="tnum">{fmt(owed.you.owed)}</strong>
              </div>
              <div className="kv-row">
                <span className="muted">
                  Builder fronted {fmt(owed.builder.fronted)}
                  {owed.builder.reimbursed > 0 && ` · ${fmt(owed.builder.reimbursed)} repaid`}
                </span>
                <strong className="tnum">{fmt(owed.builder.owed)}</strong>
              </div>
              <div className="kv-row">
                <span className="muted">
                  <strong>Total to reimburse</strong>
                </span>
                <strong className="tnum">{fmt(owed.totalOwedForFrontedCash)}</strong>
              </div>
              {owed.unpaidVendorTotal > 0 && (
                <>
                  <p className="panel-lead">
                    Separately, {fmt(owed.unpaidVendorTotal)} of invoices are unpaid — nobody has fronted
                    that cash, so it is a payable rather than a reimbursement.
                  </p>
                  {owed.unpaidVendors.slice(0, 5).map((v) => (
                    <div className="kv-row" key={v.key}>
                      <span className="muted">{v.label}</span>
                      <span className="tnum">{fmt(v.owed)}</span>
                    </div>
                  ))}
                </>
              )}
              {m.onHand > 0 && owed.totalOwedForFrontedCash > 0 && (
                <div style={{ marginTop: 12 }}>
                  <Button
                    size="sm"
                    leadingIcon={<HandCoins size={16} />}
                    onClick={() => {
                      setPayFromDrawId(undefined)
                      disbursementEditor.openNew()
                    }}
                    disabled={funded.length === 0}
                  >
                    Pay from a draw
                  </Button>
                </div>
              )}
            </SectionCard>

            <div className="list-toolbar">
              <h2 className="section-label" style={{ margin: 0 }}>
                Draws
              </h2>
              <Button size="sm" leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
                Add draw
              </Button>
            </div>
            {m.pipeline > 0 && (
              <p className="muted">{fmt(m.pipeline)} requested or approved but not yet funded.</p>
            )}

            {sortedDraws.length === 0 ? (
              <EmptyState icon={Landmark} title="No draws yet" body="Record each draw you request against the loan, then track it through to funding." />
            ) : (
              <ul className="card-list">
                {sortedDraws.map((dr) => {
                  const status = (dr.status ?? 'funded') as DrawStatus
                  const drawDisbursements = disbursements.filter((db) => db.drawId === dr.id)
                  const net = drawNetFunded(dr)
                  const out = disbursedFromDraw(dr.id, disbursements)
                  const left = undisbursedFromDraw(dr, disbursements)
                  return (
                    <li key={dr.id} className="expense-row" style={{ display: 'block' }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <button className="expense-row-open" onClick={() => editor.openEdit(dr)}>
                          <div className="expense-row-main">
                            <strong>{dr.description || 'Draw'}</strong>
                            <span className="muted">
                              <Badge tone={STATUS_TONE[status]}>{DRAW_STATUS_LABEL[status]}</Badge>{' '}
                              {status === 'funded' ? fmtDate(dr.drawDate) : fmtDate(dr.requestedDate ?? dr.drawDate)}
                              {(dr.feesAmount ?? 0) > 0 && ` · ${fmt(dr.feesAmount ?? 0)} fees`}
                            </span>
                          </div>
                          <strong className="tnum">{fmt(dr.amount)}</strong>
                        </button>
                        <button className="expense-row-del" onClick={() => delDraw(dr)} aria-label="Delete draw">
                          <Trash2 size={17} aria-hidden />
                        </button>
                      </div>

                      {status === 'funded' && (
                        <div style={{ padding: '0 12px 10px' }}>
                          <div className="kv-row">
                            <span className="muted">Cash delivered</span>
                            <span className="tnum">{fmt(net)}</span>
                          </div>
                          <div className="kv-row">
                            <span className="muted">Paid out</span>
                            <span className="tnum">{fmt(out)}</span>
                          </div>
                          <div className="kv-row">
                            <span className="muted">Still in your account</span>
                            <strong className="tnum">{fmt(left)}</strong>
                          </div>
                          {drawDisbursements.map((db) => {
                            const s = disbursementSummary(db, liveAllocations)
                            return (
                              <div className="kv-row" key={db.id}>
                                <button
                                  className="expense-row-open"
                                  style={{ padding: 0, background: 'none' }}
                                  onClick={() => disbursementEditor.openEdit(db)}
                                >
                                  <span className="muted">
                                    → {db.partyName || 'Payment'} · {fmtDate(db.disbursedDate)}
                                    {s.unallocated > 0 && s.allocated > 0 && ` · ${fmt(s.unallocated)} advance`}
                                    {s.allocated === 0 && ' · advance'}
                                  </span>
                                </button>
                                <span className="tnum">{fmt(db.amount)}</span>
                                <button
                                  className="expense-row-del"
                                  onClick={() => delDisbursement(db)}
                                  aria-label="Delete payment"
                                >
                                  <Trash2 size={15} aria-hidden />
                                </button>
                              </div>
                            )
                          })}
                          <Button
                            size="sm"
                            variant="ghost"
                            leadingIcon={<Plus size={15} />}
                            onClick={() => {
                              setPayFromDrawId(dr.id)
                              disbursementEditor.openNew()
                            }}
                            disabled={left <= 0}
                          >
                            Pay from this draw
                          </Button>
                        </div>
                      )}
                    </li>
                  )
                })}
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
        <>
          <EditorSheet editor={editor} newTitle="Add draw" editTitle="Edit draw">
            {(initial) => <DrawForm projectId={projectId} loanId={loan.id} initial={initial} onDone={editor.close} />}
          </EditorSheet>

          <EditorSheet
            editor={disbursementEditor}
            newTitle="Pay from a draw"
            editTitle="Edit payment"
          >
            {(initial) => (
              <DisbursementForm
                projectId={projectId}
                draws={draws}
                disbursements={disbursements}
                expenses={expenses}
                vendors={vendors}
                allocations={liveAllocations}
                initial={initial}
                defaultDrawId={payFromDrawId}
                onDone={disbursementEditor.close}
              />
            )}
          </EditorSheet>
        </>
      )}
    </section>
  )
}
