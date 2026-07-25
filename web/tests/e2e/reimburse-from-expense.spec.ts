import { test, expect } from '@playwright/test'

// The expense-side reimbursement flow: an expense you fronted shows what you're still owed,
// and you can settle it against a specific draw without leaving the Expenses screen.
// Runs at a phone viewport, which is where this actually gets used (on site).

const EMAIL = process.env.E2E_EMAIL ?? 'raj@local.test'
const PASSWORD = process.env.E2E_PASSWORD ?? 'localtest123'

test('expenses: tag an expense reimbursed against a draw', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const suffix = Date.now().toString().slice(-6)

  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).toHaveURL(/\/projects/)

  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByLabel('Name', { exact: true }).fill(`E2E Reimburse ${suffix}`)
  await page.getByLabel('Construction budget').fill('100000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/$/)

  // Facility + a funded draw to reimburse out of.
  await page.goto('/loan')
  await page.getByRole('button', { name: 'Set up loan' }).click()
  await page.getByRole('textbox', { name: 'Lender', exact: true }).fill('Citizens')
  await page.getByLabel('Total loan amount').fill('1500000')
  await page.getByLabel('Interest rate').fill('6')
  await page.getByRole('button', { name: 'Save loan' }).click()

  await page.getByRole('button', { name: 'Add draw' }).click()
  await page.getByLabel('Draw amount').fill('250000')
  await page.getByLabel('Description').fill('Draw 1')
  await page.getByRole('radio', { name: 'Funded', exact: true }).click()
  await page.getByRole('button', { name: 'Save draw' }).click()
  await expect(page.locator('.metric-card', { hasText: 'Cash on hand' })).toContainText('$250,000')

  // A soft cost fronted personally.
  await page.goto('/expenses')
  await page.getByRole('button', { name: 'Add expense' }).click()
  await page.getByLabel('Vendor', { exact: true }).fill('Lorenzo Franchina')
  await page.getByLabel('Amount', { exact: true }).fill('5000')
  await page.getByRole('radio', { name: 'Paid', exact: true }).click()
  await page.getByRole('button', { name: 'Save expense' }).click()

  // The expense row now says what's still owed to you.
  const owedChip = page.getByRole('button', { name: /Reimbursement for Lorenzo Franchina/ })
  await expect(owedChip).toContainText('Owed')
  await expect(owedChip).toContainText('$5,000 owed')
  await page.screenshot({ path: 'test-results/expenses-unreimbursed.png', fullPage: false })

  // Settle half of it against the draw.
  await owedChip.click()
  await expect(page.getByRole('dialog', { name: /Reimburse Lorenzo Franchina/ })).toBeVisible()
  // Clear first: the currency input is controlled and pre-filled with the full $5,000 owed,
  // so a single fill() appends rather than replaces.
  await page.getByLabel('Amount', { exact: true }).fill('')
  await page.getByLabel('Amount', { exact: true }).fill('2000')
  await page.getByRole('button', { name: 'Record reimbursement' }).click()

  // Partial state, and the draw that settled it, are both on the row.
  await expect(owedChip).toContainText('$3,000 owed')
  await expect(owedChip).toContainText('Draw 1')
  await page.screenshot({ path: 'test-results/expenses-partially-reimbursed.png', fullPage: false })

  // Cash left the draw…
  await page.goto('/loan')
  await expect(page.locator('.metric-card', { hasText: 'Cash on hand' })).toContainText('$248,000')

  // …but the budget is untouched: $5,000 incurred, not $7,000.
  await page.goto('/')
  const financialSummary = page.getByRole('region', { name: 'Project financial summary' })
  await expect(
    financialSummary.locator('.summary-metric').filter({ hasText: 'Incurred cost' }),
  ).toContainText('$5,000')
})
