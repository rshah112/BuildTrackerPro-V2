import { useRows, useCreateRow, useUpdateRow, useRemoveRow } from '../../data/hooks'
import type { ConstructionLoan, LoanDraw } from '../../domain/types'

// A project has at most one (active) construction loan and many draws against it.
export const useLoan = (projectId: string) => useRows<ConstructionLoan>('construction_loans', { projectId })
export const useCreateLoan = () => useCreateRow<ConstructionLoan>('construction_loans')
export const useUpdateLoan = () => useUpdateRow<ConstructionLoan>('construction_loans')
export const useRemoveLoan = () => useRemoveRow('construction_loans')

export const useLoanDraws = (projectId: string) => useRows<LoanDraw>('loan_draws', { projectId })
export const useCreateDraw = () => useCreateRow<LoanDraw>('loan_draws')
export const useUpdateDraw = () => useUpdateRow<LoanDraw>('loan_draws')
export const useRemoveDraw = () => useRemoveRow('loan_draws')
