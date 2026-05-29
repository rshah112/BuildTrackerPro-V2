import { test, expect } from '@playwright/test'

const EMAIL = process.env.E2E_EMAIL || 'raj@local.test'
const PASSWORD = process.env.E2E_PASSWORD || 'localtest123'

test('unauthenticated visit redirects to login, then sign-in lands on dashboard', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)

  await page.getByLabel(/email/i).fill(EMAIL)
  await page.getByLabel(/password/i).fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})
