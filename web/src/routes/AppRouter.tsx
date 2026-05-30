import { lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LoginScreen } from '../features/auth/LoginScreen'
import { RequireAuth } from '../features/auth/RequireAuth'
import { AppShell } from '../app/AppShell'
import { CurrentProjectProvider, RequireProject } from '../features/projects/currentProject'

// Screens are code-split: each becomes its own chunk loaded on first navigation, so the
// initial bundle (opened to the dashboard) doesn't ship every screen — and heavy,
// rarely-used screens like Export (xlsx/jspdf) stay out of the critical path entirely.
// The login screen + app shell stay eager so the first paint isn't a Suspense fallback.
const ProjectsScreen = lazy(() => import('../features/projects/ProjectsScreen').then((m) => ({ default: m.ProjectsScreen })))
const DashboardScreen = lazy(() => import('../features/dashboard/DashboardScreen').then((m) => ({ default: m.DashboardScreen })))
const BudgetScreen = lazy(() => import('../features/budget/BudgetScreen').then((m) => ({ default: m.BudgetScreen })))
const ExpensesScreen = lazy(() => import('../features/expenses/ExpensesScreen').then((m) => ({ default: m.ExpensesScreen })))
const PhotosScreen = lazy(() => import('../features/photos/PhotosScreen').then((m) => ({ default: m.PhotosScreen })))
const MoreScreen = lazy(() => import('../features/more/MoreScreen').then((m) => ({ default: m.MoreScreen })))
const VendorsScreen = lazy(() => import('../features/vendors/VendorsScreen').then((m) => ({ default: m.VendorsScreen })))
const ChangeOrdersScreen = lazy(() => import('../features/changeOrders/ChangeOrdersScreen').then((m) => ({ default: m.ChangeOrdersScreen })))
const AllowancesScreen = lazy(() => import('../features/allowances/AllowancesScreen').then((m) => ({ default: m.AllowancesScreen })))
const TasksScreen = lazy(() => import('../features/tasks/TasksScreen').then((m) => ({ default: m.TasksScreen })))
const BidsScreen = lazy(() => import('../features/bids/BidsScreen').then((m) => ({ default: m.BidsScreen })))
const CashFlowScreen = lazy(() => import('../features/cashflow/CashFlowScreen').then((m) => ({ default: m.CashFlowScreen })))
const ExportScreen = lazy(() => import('../features/export/ExportScreen').then((m) => ({ default: m.ExportScreen })))

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
