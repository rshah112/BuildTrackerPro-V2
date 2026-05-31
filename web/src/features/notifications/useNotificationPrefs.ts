import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRows } from '../../data/hooks'
import { supabase } from '../../lib/supabase'
import type { NotificationPrefs } from '../../domain/types'

const TABLE = 'notification_prefs'

export const DEFAULT_PREFS: Omit<NotificationPrefs, 'owner' | 'updatedAt'> = {
  leadDays: 3,
  quietStart: 21,
  quietEnd: 7,
  remindDueSoon: true,
  remindOverdue: true,
  remindChangeOrders: true,
}

/** The current owner's reminder prefs (0 or 1 row). RLS scopes it to the owner.
 *  `trashed: 'all'` because this table has no `deleted_at` column — the default soft-delete
 *  filter (`deleted_at IS NULL`) would error against a column that doesn't exist. */
export const useNotificationPrefs = () => useRows<NotificationPrefs>(TABLE, undefined, { trashed: 'all' })

/** Upsert the owner's prefs. `owner` defaults to auth.uid() in the schema, so the conflict
 *  target resolves to the single owner row. */
export function useSaveNotificationPrefs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Omit<NotificationPrefs, 'owner' | 'updatedAt'>) => {
      const { error } = await supabase.from(TABLE).upsert(
        {
          lead_days: patch.leadDays,
          quiet_start: patch.quietStart,
          quiet_end: patch.quietEnd,
          remind_due_soon: patch.remindDueSoon,
          remind_overdue: patch.remindOverdue,
          remind_change_orders: patch.remindChangeOrders,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: 'owner' },
      )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [TABLE] }),
  })
}
