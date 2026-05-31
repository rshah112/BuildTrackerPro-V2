import { supabase } from '../../lib/supabase'
import { makeBudgetDraft } from '../../domain/projectTemplates'
import type { ProjectTemplateType } from '../../domain/enums'

/** Pre-populate a freshly-created project's budget from its template + construction budget:
 *  inserts the template's categories (with allocated target budgets) and line items in two
 *  bulk requests. `owner` defaults to auth.uid() in the schema; RLS scopes the rows. No-op
 *  for 'custom' / budget <= 0. Returns the number of categories created. */
export async function seedProjectBudget(
  projectId: string,
  templateType: ProjectTemplateType,
  constructionBudget: number,
): Promise<number> {
  const { categories, lineItems } = makeBudgetDraft(templateType, constructionBudget)
  if (categories.length === 0) return 0

  const { error: catErr } = await supabase.from('budget_categories').insert(
    categories.map((c) => ({
      project_id: projectId,
      name: c.name,
      sort_order: c.sortOrder,
      target_budget: c.targetBudget,
    })) as never,
  )
  if (catErr) throw catErr

  if (lineItems.length > 0) {
    const { error: liErr } = await supabase.from('budget_line_items').insert(
      lineItems.map((l) => ({
        project_id: projectId,
        category_name: l.categoryName,
        cost_code: l.costCode,
        title: l.title,
        budget: l.budget,
        notes: l.notes,
      })) as never,
    )
    if (liErr) throw liErr
  }
  return categories.length
}
