import { useRows, useCreateRow, useUpdateRow, useRemoveRow } from '../../data/hooks'
import type { DisbursementAllocation, DrawDisbursement } from '../../domain/types'

/**
 * The ONLY tables the loan-treasury feature writes to. Both are absent from
 * calculated_line_item_actual() (migration 0017), which is what structurally guarantees a
 * reimbursement can never land in budget actuals, category spend, EAC, or cash flow.
 *
 * Asserted in reimbursementNonDisturbance.test.ts — do not add a cost-bearing table here.
 */
export const TREASURY_TABLES = ['draw_disbursements', 'disbursement_allocations'] as const

export const useDisbursements = (projectId: string) =>
  useRows<DrawDisbursement>('draw_disbursements', { projectId })
export const useCreateDisbursement = () => useCreateRow<DrawDisbursement>('draw_disbursements')
export const useUpdateDisbursement = () => useUpdateRow<DrawDisbursement>('draw_disbursements')
export const useRemoveDisbursement = () => useRemoveRow('draw_disbursements')

export const useAllocations = (projectId: string) =>
  useRows<DisbursementAllocation>('disbursement_allocations', { projectId })
export const useCreateAllocation = () => useCreateRow<DisbursementAllocation>('disbursement_allocations')
export const useUpdateAllocation = () => useUpdateRow<DisbursementAllocation>('disbursement_allocations')
export const useRemoveAllocation = () => useRemoveRow('disbursement_allocations')
