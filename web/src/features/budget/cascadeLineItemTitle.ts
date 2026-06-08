import { supabase } from '../../lib/supabase'

// When a budget line item's title changes, propagate it to the denormalized
// `budget_line_item_title` copies that expenses, change orders, and documents carry. Those copies
// drive the list rows and the export sheets; the live link is the id (unaffected), so money is
// never wrong — this is display consistency. RLS scopes every update to the owner. Uses the
// supabase client directly with snake_case columns to do ONE filtered UPDATE per table rather
// than read-then-write each row.
export async function cascadeLineItemTitle(lineItemId: string, newTitle: string): Promise<void> {
  await Promise.all([
    supabase.from('expenses').update({ budget_line_item_title: newTitle }).eq('budget_line_item_id', lineItemId),
    supabase.from('change_orders').update({ budget_line_item_title: newTitle }).eq('budget_line_item_id', lineItemId),
    supabase.from('project_documents').update({ budget_line_item_title: newTitle }).eq('budget_line_item_id', lineItemId),
  ])
}
