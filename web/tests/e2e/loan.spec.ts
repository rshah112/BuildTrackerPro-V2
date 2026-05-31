import { test, expect } from '@playwright/test'

// Construction-loan flow against the local Supabase stack: sign in → create project →
// set up a loan → add a draw → the drawn/available figures update. Guards the loan
// feature + its math. Requires `supabase start` + the seeded test user.

const EMAIL = process.env.E2E_EMAIL ?? 'raj@local.test'
const PASSWORD = process.env.E2E_PASSWORD ?? 'localtest123'

test('loan: set up facility → add draw → drawn/available update', async ({ page }) => {
  const suffix = Date.now().toString().slice(-6)
  const projectName = `E2E Loan ${suffix}`

  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).toHaveURL(/\/projects/)

  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByLabel('Name', { exact: true }).fill(projectName)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/$/)

  // More → Construction loan
  await page.getByRole('link', { name: 'More' }).click()
  await page.getByRole('link', { name: 'Construction loan' }).click()
  await expect(page.getByRole('heading', { name: 'Construction loan', exact: true })).toBeVisible()

  // Set up the facility
  await page.getByRole('button', { name: 'Set up loan' }).click()
  await expect(page.getByRole('dialog', { name: 'Set up loan' })).toBeVisible()
  await page.getByLabel('Lender').fill('First National')
  await page.getByLabel('Total loan amount').fill('1300000')
  await page.getByLabel('Interest rate').fill('8.5')
  await page.getByRole('button', { name: 'Save loan' }).click()

  // Facility shows; nothing drawn yet.
  await expect(page.locator('.metric-card', { hasText: 'Available' })).toContainText('$1,300,000')

  // Add a draw of $200,000
  await page.getByRole('button', { name: 'Add draw' }).click()
  await expect(page.getByRole('dialog', { name: 'Add draw' })).toBeVisible()
  await page.getByLabel('Draw amount').fill('200000')
  await page.getByRole('button', { name: 'Save draw' }).click()

  // Drawn and available reflect the draw.
  await expect(page.locator('.metric-card', { hasText: 'Drawn' })).toContainText('$200,000')
  await expect(page.locator('.metric-card', { hasText: 'Available' })).toContainText('$1,100,000')
})
