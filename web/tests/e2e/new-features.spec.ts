import { test, expect, type Page } from '@playwright/test'

// Covers the native-parity features added this round: template budget seeding, list search,
// line-item detail + duplicate, and expense funding source (personal vs loan).

const EMAIL = process.env.E2E_EMAIL ?? 'raj@local.test'
const PASSWORD = process.env.E2E_PASSWORD ?? 'localtest123'

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForLoadState('networkidle')
}

test('templates, search, line-item detail/duplicate, funding source', async ({ page }) => {
  const suffix = Date.now().toString().slice(-6)
  await login(page)

  // --- Create a project with a template + budget → categories seeded ---
  await page.goto('/projects')
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByLabel('Name', { exact: true }).fill(`E2E Feat ${suffix}`)
  await page.getByLabel('Template').selectOption('customHome')
  await page.getByLabel('Construction budget').fill('1000000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/$/)

  await page.getByRole('link', { name: 'Budget' }).click()
  await expect(page.locator('.budget-cat').first()).toBeVisible()
  await expect(page.locator('.budget-cat')).toHaveCount(8) // seeded categories
  await expect(page.getByText('Interior Finishes')).toBeVisible()

  // --- Budget search ---
  await page.getByPlaceholder('Search line items, cost code, notes').fill('Framing')
  await expect(page.getByText('Framing', { exact: true })).toBeVisible()
  await expect(page.locator('.budget-cat')).not.toHaveCount(8) // narrowed
  await page.getByPlaceholder('Search line items, cost code, notes').fill('')

  // --- Line-item detail + duplicate (expand Framing, open an item) ---
  await page.locator('.budget-cat', { hasText: 'Framing' }).getByRole('button').first().click()
  const item = page.locator('.lineitem-title-btn', { hasText: 'Lumber and Framing Package' })
  await item.click()
  await expect(page.getByRole('dialog', { name: 'Lumber and Framing Package' })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Duplicate' }).click()
  await expect(page.getByText('Lumber and Framing Package (copy)')).toBeVisible({ timeout: 10000 })

  // --- Loan → funding source on expenses ---
  await page.goto('/loan')
  await page.getByRole('button', { name: 'Set up loan' }).click()
  await page.getByLabel('Total loan amount').fill('500000')
  await page.getByLabel('Interest rate').fill('8')
  await page.getByRole('button', { name: 'Save loan' }).click()
  await expect(page.locator('.metric-card', { hasText: 'Loan amount' })).toBeVisible()

  await page.goto('/expenses')
  await page.getByRole('button', { name: 'Add expense' }).click()
  await page.getByLabel('Vendor', { exact: true }).fill('Loan Vendor')
  await page.getByLabel('Amount', { exact: true }).fill('5000')
  // Funding source select only appears because a loan exists
  await page.getByLabel('Funding source').selectOption('loan')
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.getByText('Loan Vendor')).toBeVisible()

  // Loan screen reflects the loan-funded spend
  await page.goto('/loan')
  await expect(page.locator('.panel', { hasText: 'Funding split' })).toContainText('$5,000')
})
