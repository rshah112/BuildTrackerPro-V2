import { test, expect } from '@playwright/test'

// Core budget loop, end to end against the local Supabase stack:
// sign in → create project → add category + line item → log an expense →
// the dashboard reflects the spend and the line-item health.
//
// Requires the local stack running (`supabase start`) and the seeded test user
// (`node --env-file=.env scripts/seed-user.mjs`). Vite loads .env for the app's
// Supabase config; the credentials below mirror seed-user.mjs's defaults.

const EMAIL = process.env.E2E_EMAIL ?? 'raj@local.test'
const PASSWORD = process.env.E2E_PASSWORD ?? 'localtest123'

test('budget loop: project → category → line item → expense → dashboard', async ({ page }) => {
  // Unique per run so reruns don't collide and we can target this project's card.
  const suffix = Date.now().toString().slice(-6)
  const projectName = `E2E Build ${suffix}`

  // --- Sign in ---
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()

  // No project selected yet → app bounces to the portfolio.
  await expect(page).toHaveURL(/\/projects/)

  // --- Create a project ---
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByLabel('Name', { exact: true }).fill(projectName)
  await page.getByLabel('Construction budget').fill('100000')
  await page.getByRole('button', { name: 'Save' }).click()

  // Open it → scopes the project-bound tabs and lands on the dashboard.
  await page.getByRole('button', { name: projectName }).click()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()

  // --- Add a category ---
  await page.getByRole('link', { name: 'Budget' }).click()
  await page.getByRole('button', { name: 'Add category' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Framing')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Framing')).toBeVisible()

  // --- Add a line item under it (budget $1,000) ---
  await page.getByRole('button', { name: '+ Line item' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Lumber')
  await page.getByLabel('Budget', { exact: true }).fill('1000')
  await page.getByRole('button', { name: 'Save' }).click()

  // --- Log an expense of $1,200 against the line item, fully paid ---
  await page.getByRole('link', { name: 'Expenses' }).click()
  await page.getByRole('button', { name: 'Add expense' }).click()
  await page.getByLabel('Vendor', { exact: true }).fill('Acme Lumber')
  await page.getByLabel('Amount', { exact: true }).fill('1200')
  await page.getByLabel('Budget line').selectOption({ label: 'Framing / Lumber' })
  await page.getByLabel('Amount paid').fill('1200')
  await page.getByRole('button', { name: 'Save expense' }).click()

  // The expense lands in the list.
  await expect(page.getByText('Acme Lumber')).toBeVisible()

  // --- Dashboard reflects the spend and the health roll-up ---
  await page.getByRole('link', { name: 'Dashboard' }).click()
  await expect(page.getByRole('heading', { name: projectName })).toBeVisible()

  const actualCard = page.locator('.metric-card', { hasText: 'Actual spend' })
  await expect(actualCard).toContainText('$1,200')

  // Line item is $1,200 spent on a $1,000 budget → over budget.
  await expect(page.locator('li', { hasText: 'over budget line items' })).toContainText('1')

  // Recent expenses surfaces the vendor we just logged.
  await expect(page.locator('.panel', { hasText: 'Recent expenses' })).toContainText('Acme Lumber')
})
