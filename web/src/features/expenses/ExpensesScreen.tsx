import { useCurrentProject } from '../projects/currentProject'
import { useLineItems } from '../budget/useBudget'
import { ScreenHeader } from '../../app/ScreenHeader'
import { ListSkeleton } from '../../components/ui/Feedback'
import { ExpenseList } from './ExpenseList'

export function ExpensesScreen() {
  const { projectId } = useCurrentProject()
  const { data: lineItems = [], isLoading, error } = useLineItems(projectId!)

  if (!projectId) return null
  return (
    <section>
      <ScreenHeader title="Expenses" />
      {error ? (
        <p role="alert" className="error-banner">
          Couldn’t load expense categories: {(error as Error).message}
        </p>
      ) : isLoading ? (
        <ListSkeleton />
      ) : (
        <ExpenseList projectId={projectId} lineItems={lineItems} />
      )}
    </section>
  )
}
