import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { AllowanceSelection, BudgetLineItem, ChangeOrder, Expense } from '../../domain/types'
import { supabase } from '../../lib/supabase'
import { isNetworkError, isOnline, isRetryablePostgrestError } from '../../lib/netStatus'

interface Overrides {
  lineItems?: BudgetLineItem[]
  expenses?: Expense[]
  changeOrders?: ChangeOrder[]
  allowanceSelections?: AllowanceSelection[]
}

/** Ask Postgres to reconcile a project's stored line-item actuals. The migration also
 *  installs transaction triggers, so this explicit call is an immediate UI refresh and
 *  a compatibility point—not the only correctness mechanism. `overrides` remains in the
 *  signature so existing save flows need no special cache choreography. */
export function useSyncActuals(projectId: string) {
  const queryClient = useQueryClient()

  return useCallback(
    async (overrides?: Overrides) => {
      // Kept for call-site compatibility while PostgreSQL is now the sole calculator.
      void overrides
      try {
        if (!isOnline()) return
        const { error, status } = await supabase.rpc('reconcile_project_actuals', {
          target_project: projectId,
        })
        if (error && !isRetryablePostgrestError(error, status)) throw error
      } catch (error) {
        // Offline primary writes are already durable in the outbox. Their eventual
        // replay fires the database trigger, so a transient RPC failure is not a save failure.
        if (!isNetworkError(error)) throw error
      } finally {
        await queryClient.invalidateQueries({ queryKey: ['budget_line_items'] })
      }
    },
    [projectId, queryClient],
  )
}
