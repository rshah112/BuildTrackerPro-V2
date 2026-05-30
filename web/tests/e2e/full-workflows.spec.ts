import { test, expect } from '@playwright/test'

// Drives the Wave 3-5 ops workflows as a real user: vendor create, task create +
// mark-done, bid package -> bid -> award -> unaward, and the export screen renders.

const EMAIL = process.env.E2E_EMAIL ?? 'raj@local.test'
const PASSWORD = process.env.E2E_PASSWORD ?? 'localtest123'

test('ops workflows: vendor, task, bid award/unaward, export', async ({ page }) => {
  const suffix = Date.now().toString().slice(-6)
  const projectName = `QA Build ${suffix}`

  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).toHaveURL(/\/projects/)
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByLabel('Name', { exact: true }).fill(projectName)
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: projectName }).click()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()

  // --- Vendor ---
  await page.goto('/vendors')
  await page.getByRole('button', { name: 'Add vendor' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Sub Contractor A')
  await page.getByLabel('Trade').fill('Framing')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Sub Contractor A')).toBeVisible()

  // --- Task: create + mark done ---
  await page.goto('/tasks')
  await page.getByRole('button', { name: 'Add task' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Frame exterior walls')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Frame exterior walls')).toBeVisible()
  await page.getByRole('button', { name: 'Mark done' }).click()
  await expect(page.getByRole('button', { name: 'Mark not done' })).toBeVisible()

  // --- Bids: package -> bid -> award -> unaward ---
  await page.goto('/bids')
  await page.getByRole('button', { name: 'Add package' }).click()
  await page.getByLabel('Scope', { exact: true }).fill('Framing package')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Framing package')).toBeVisible()
  await page.getByText('Framing package').click()
  await page.getByRole('button', { name: 'Add bid' }).click()
  await page.getByLabel('Vendor', { exact: true }).fill('Acme Framing Co')
  await page.getByLabel('Amount', { exact: true }).fill('48000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Acme Framing Co')).toBeVisible()
  // award -> Unaward appears; unaward -> Award returns
  await page.getByRole('button', { name: 'Award' }).click()
  await expect(page.getByRole('button', { name: 'Unaward' })).toBeVisible()
  await page.getByRole('button', { name: 'Unaward' }).click()
  await expect(page.getByRole('button', { name: 'Award' })).toBeVisible()

  // --- Export screen renders its actions ---
  await page.goto('/export')
  await expect(page.getByRole('button', { name: /Export Excel workbook/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Download JSON backup/ })).toBeVisible()
})
