import { test, expect } from '@playwright/test'

// Change-order flow: sign in → create + open a project → More → Change orders →
// add an approved change order → it appears in the list.

const EMAIL = process.env.E2E_EMAIL ?? 'raj@local.test'
const PASSWORD = process.env.E2E_PASSWORD ?? 'localtest123'

test('change order: create project → add change order → it appears', async ({ page }) => {
  const suffix = Date.now().toString().slice(-6)
  const projectName = `CO Build ${suffix}`

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

  await page.getByRole('link', { name: 'More' }).click()
  await page.getByRole('link', { name: 'Change orders' }).click()

  await page.getByRole('button', { name: 'Add change order' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Extra framing')
  await page.getByLabel('Amount', { exact: true }).fill('5000')
  await page.getByLabel('Status').selectOption('approved')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('Extra framing')).toBeVisible()
  await expect(page.locator('.metric-card', { hasText: 'Approved' })).toContainText('$5,000')
})
