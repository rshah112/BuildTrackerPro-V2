import { useCurrentProject } from '../projects/currentProject'
import { useLineItems } from '../budget/useBudget'
import { ScreenHeader } from '../../app/ScreenHeader'
import { ExpenseList } from './ExpenseList'

export function ExpensesScreen() {
  const { projectId } = useCurrentProject()
  const { data: lineItems = [], isLoading } = useLineItems(projectId!)

  if (!projectId) return null
  return (
    <section>
      <ScreenHeader title="Expenses" />
      {isLoading ? (
        <div className="loading">Loading expenses…</div>
      ) : (
        <ExpenseList projectId={projectId} lineItems={lineItems} />
      )}
    </section>
  )
}
