import { test, expect, type Page } from '@playwright/test'

// Covers the Reminder settings screen: edit lead time + toggles, save (upsert to
// notification_prefs), and confirm the values persist across a reload.

const EMAIL = process.env.E2E_EMAIL ?? 'raj@local.test'
const PASSWORD = process.env.E2E_PASSWORD ?? 'localtest123'

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForLoadState('networkidle')
}

test('reminder settings save + persist', async ({ page }) => {
  await login(page)

  await page.goto('/notification-settings')
  await expect(page.getByRole('heading', { name: 'Reminder settings' })).toBeVisible()

  // Change lead time and turn off change-order reminders, then save.
  await page.getByLabel('Remind me about upcoming invoices').selectOption('7')
  await page.getByLabel('Change-order payments').uncheck()
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Reminder settings saved')).toBeVisible()

  // Reload → the saved values are read back from the DB.
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.getByLabel('Remind me about upcoming invoices')).toHaveValue('7')
  await expect(page.getByLabel('Change-order payments')).not.toBeChecked()
})
