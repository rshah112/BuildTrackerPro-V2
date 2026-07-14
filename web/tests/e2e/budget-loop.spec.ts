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
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()

  // No project selected yet → app bounces to the portfolio.
  await expect(page).toHaveURL(/\/projects/)

  // --- Create a project ---
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByLabel('Name', { exact: true }).fill(projectName)
  await page.getByLabel('Construction budget').fill('100000')
  await page.getByRole('button', { name: 'Save' }).click()

  // Creating a project now auto-selects it and lands on its dashboard.
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()

  // --- Add a category ---
  await page.getByRole('link', { name: 'Budget' }).click()
  await page.getByRole('button', { name: 'Add category' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Framing')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Framing')).toBeVisible()

  // --- Add a line item under it (budget $1,000) ---
  await page.getByRole('button', { name: /^Framing 0 line items/ }).click()
  await page
    .locator('.budget-line-panel')
    .getByRole('button', { name: 'Add line item', exact: true })
    .click()
  await page.getByLabel('Title', { exact: true }).fill('Lumber')
  await page.getByRole('textbox', { name: 'Budget', exact: true }).fill('1000')
  await page.getByRole('button', { name: 'Save' }).click()

  // --- Log an expense of $1,200 against the line item, fully paid ---
  await page.getByRole('link', { name: 'Expenses' }).click()
  await page.getByRole('button', { name: 'Add expense' }).click()
  await page.getByLabel('Vendor', { exact: true }).fill('Acme Lumber')
  await page.getByLabel('Amount', { exact: true }).fill('1200')
  // Budget line is a searchable combobox: type to filter, then pick the option.
  await page.getByLabel('Budget line').fill('Lumber')
  await page.getByRole('option', { name: 'Lumber' }).click()
  // Mark Paid — the "paid in full today" default sets Amount paid = Amount ($1,200).
  // exact: true so it doesn't also match "Unpaid".
  await page.getByRole('radio', { name: 'Paid', exact: true }).click()
  await page.getByRole('button', { name: 'Save expense' }).click()

  // The expense lands in the list.
  await expect(page.getByText('Acme Lumber')).toBeVisible()

  // --- Dashboard reflects the spend and the health roll-up ---
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await expect(page.getByRole('main').getByText(projectName, { exact: true })).toBeVisible()

  const financialSummary = page.getByRole('region', { name: 'Project financial summary' })
  await expect(
    financialSummary.locator('.summary-metric').filter({ hasText: 'Incurred cost' }),
  ).toContainText('$1,200')

  // Line item is $1,200 spent on a $1,000 budget → over budget.
  await expect(page.locator('.attention-list li').filter({ hasText: 'Over budget' })).toContainText(
    /1 line item.*exceed budget/,
  )

  // Recent expenses surfaces the vendor we just logged.
  await expect(page.locator('.panel', { hasText: 'Recent expenses' })).toContainText('Acme Lumber')
})
