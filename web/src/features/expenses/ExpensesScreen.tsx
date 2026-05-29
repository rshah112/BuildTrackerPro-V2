import { useCurrentProject } from '../projects/currentProject'
import { useLineItems } from '../budget/useBudget'
import { ExpenseList } from './ExpenseList'

export function ExpensesScreen() {
  const { projectId } = useCurrentProject()
  const { data: lineItems = [], isLoading } = useLineItems(projectId!)

  if (!projectId) return null
  if (isLoading) return <div className="loading">Loading expenses...</div>
  return (
    <section>
      <h1>Expenses</h1>
      <ExpenseList projectId={projectId} lineItems={lineItems} />
    </section>
  )
}
