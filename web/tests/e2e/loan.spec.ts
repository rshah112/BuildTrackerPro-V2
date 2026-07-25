import { test, expect } from '@playwright/test'

// Construction-loan flow against the local Supabase stack. Two things are guarded here:
//   1. the draw lifecycle — only a FUNDED draw moves money, so a requested draw must not
//      touch the balance, available credit, or interest;
//   2. the accounting rule the whole feature rests on — reimbursing yourself out of a draw
//      is a CASH movement, so the budget's incurred cost must NOT change.
// Requires `supabase start` + the seeded test user.

const EMAIL = process.env.E2E_EMAIL ?? 'raj@local.test'
const PASSWORD = process.env.E2E_PASSWORD ?? 'localtest123'

test('loan: lifecycle → draw funds → reimbursement leaves the budget untouched', async ({ page }) => {
  const suffix = Date.now().toString().slice(-6)
  const projectName = `E2E Loan ${suffix}`

  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).toHaveURL(/\/projects/)

  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByLabel('Name', { exact: true }).fill(projectName)
  await page.getByLabel('Construction budget').fill('100000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/$/)

  // --- A soft cost fronted from personal funds — the thing draw #1 will repay ---
  await page.getByRole('link', { name: 'Expenses' }).click()
  await page.getByRole('button', { name: 'Add expense' }).click()
  await page.getByLabel('Vendor', { exact: true }).fill('Lorenzo Franchina')
  await page.getByLabel('Amount', { exact: true }).fill('5000')
  await page.getByRole('radio', { name: 'Paid', exact: true }).click()
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.getByText('Lorenzo Franchina')).toBeVisible()

  // --- Set up the facility on the baseline terms ---
  await page.getByRole('link', { name: 'More' }).click()
  await page.getByRole('link', { name: 'Construction loan' }).click()
  await expect(page.getByRole('heading', { name: 'Construction loan', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Set up loan' }).click()
  await expect(page.getByRole('dialog', { name: 'Set up loan' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Lender', exact: true }).fill('First National')
  await page.getByLabel('Total loan amount').fill('1500000')
  await page.getByLabel('Interest rate').fill('6')
  await page.getByLabel('Term (months)').fill('15')
  await page.getByLabel('Closing / start date').fill('2026-09-01')
  await page.getByRole('button', { name: 'Save loan' }).click()

  // Facility shows; nothing drawn yet.
  await expect(page.locator('.metric-card', { hasText: 'Available' })).toContainText('$1,500,000')

  // --- A REQUESTED draw is pipeline, not money ---
  await page.getByRole('button', { name: 'Add draw' }).click()
  await expect(page.getByRole('dialog', { name: 'Add draw' })).toBeVisible()
  await page.getByLabel('Draw amount').fill('250000')
  await page.getByLabel('Description').fill('Draw 1 — soft costs')
  await page.getByRole('button', { name: 'Save draw' }).click()

  await expect(page.locator('.metric-card', { hasText: 'Drawn' })).toContainText('$0')
  await expect(page.locator('.metric-card', { hasText: 'Available' })).toContainText('$1,500,000')
  await expect(page.getByText(/requested or approved but not yet funded/)).toBeVisible()

  // --- Fund it, with $2,500 of lender fees netted out of the wire ---
  await page.getByRole('button', { name: /Draw 1 — soft costs/ }).click()
  await expect(page.getByRole('dialog', { name: 'Edit draw' })).toBeVisible()
  await page.getByRole('radio', { name: 'Funded', exact: true }).click()
  await page.getByLabel('Fees netted from this draw').fill('2500')
  await page.getByRole('button', { name: 'Save draw' }).click()

  // Principal counts in full against the facility; cash on hand is net of fees.
  await expect(page.locator('.metric-card', { hasText: 'Drawn' })).toContainText('$250,000')
  await expect(page.locator('.metric-card', { hasText: 'Available' })).toContainText('$1,250,000')
  await expect(page.locator('.metric-card', { hasText: 'Cash on hand' })).toContainText('$247,500')

  // The $5,000 fronted personally is owed back to you.
  await expect(page.locator('.panel', { hasText: 'Who is owed right now' })).toContainText('$5,000')

  // --- Reimburse yourself out of the draw, but only PARTIALLY ($3,000 of the $5,000) ---
  await page.getByRole('button', { name: 'Pay from a draw' }).first().click()
  await expect(page.getByRole('dialog', { name: 'Pay from a draw' })).toBeVisible()
  await page.getByRole('button', { name: /Apply all outstanding/ }).click()
  // Tagging every receipt sets the cheque to $5,000; dial one row back to a part payment.
  await page.getByLabel('Amount applied to Lorenzo Franchina').fill('3000')
  await page.getByRole('button', { name: 'Record payment' }).click()

  // Cash moved by exactly the part payment.
  await expect(page.locator('.metric-card', { hasText: 'Cash on hand' })).toContainText('$244,500')
  // …and the remaining $2,000 is still owed to you.
  await expect(page.locator('.panel', { hasText: 'Who is owed right now' })).toContainText('$2,000')

  // --- THE POINT: the budget did not move. $5,000 spent, not $8,000. ---
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  const financialSummary = page.getByRole('region', { name: 'Project financial summary' })
  await expect(
    financialSummary.locator('.summary-metric').filter({ hasText: 'Incurred cost' }),
  ).toContainText('$5,000')
})
