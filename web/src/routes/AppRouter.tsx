import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LoginScreen } from '../features/auth/LoginScreen'
import { RequireAuth } from '../features/auth/RequireAuth'
import { AppShell } from '../app/AppShell'
import { DashboardScreen } from '../features/dashboard/DashboardScreen'
import { BudgetScreen } from '../features/budget/BudgetScreen'
import { PhotosScreen } from '../features/photos/PhotosScreen'
import { MoreScreen } from '../features/more/MoreScreen'

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/" element={<DashboardScreen />} />
          <Route path="/budget" element={<BudgetScreen />} />
          <Route path="/photos" element={<PhotosScreen />} />
          <Route path="/more" element={<MoreScreen />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
