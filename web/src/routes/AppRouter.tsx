import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LoginScreen } from '../features/auth/LoginScreen'
import { RequireAuth } from '../features/auth/RequireAuth'
import { AppShell } from '../app/AppShell'
import { CurrentProjectProvider, RequireProject } from '../features/projects/currentProject'
import { ProjectsScreen } from '../features/projects/ProjectsScreen'
import { DashboardScreen } from '../features/dashboard/DashboardScreen'
import { BudgetScreen } from '../features/budget/BudgetScreen'
import { ExpensesScreen } from '../features/expenses/ExpensesScreen'
import { PhotosScreen } from '../features/photos/PhotosScreen'
import { MoreScreen } from '../features/more/MoreScreen'
import { VendorsScreen } from '../features/vendors/VendorsScreen'
import { ChangeOrdersScreen } from '../features/changeOrders/ChangeOrdersScreen'
import { AllowancesScreen } from '../features/allowances/AllowancesScreen'
import { TasksScreen } from '../features/tasks/TasksScreen'
import { BidsScreen } from '../features/bids/BidsScreen'
import { CashFlowScreen } from '../features/cashflow/CashFlowScreen'
import { ExportScreen } from '../features/export/ExportScreen'

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route
          element={
            <RequireAuth>
              <CurrentProjectProvider>
                <AppShell />
              </CurrentProjectProvider>
            </RequireAuth>
          }
        >
          <Route path="/projects" element={<ProjectsScreen />} />
          <Route path="/" element={<RequireProject><DashboardScreen /></RequireProject>} />
          <Route path="/budget" element={<RequireProject><BudgetScreen /></RequireProject>} />
          <Route path="/expenses" element={<RequireProject><ExpensesScreen /></RequireProject>} />
          <Route path="/photos" element={<RequireProject><PhotosScreen /></RequireProject>} />
          <Route path="/vendors" element={<RequireProject><VendorsScreen /></RequireProject>} />
          <Route path="/change-orders" element={<RequireProject><ChangeOrdersScreen /></RequireProject>} />
          <Route path="/allowances" element={<RequireProject><AllowancesScreen /></RequireProject>} />
          <Route path="/tasks" element={<RequireProject><TasksScreen /></RequireProject>} />
          <Route path="/bids" element={<RequireProject><BidsScreen /></RequireProject>} />
          <Route path="/cashflow" element={<RequireProject><CashFlowScreen /></RequireProject>} />
          <Route path="/export" element={<RequireProject><ExportScreen /></RequireProject>} />
          <Route path="/more" element={<MoreScreen />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
