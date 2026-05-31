import { test, expect, type Page } from '@playwright/test'

// Covers the deferred-features round: Phase Pulse (standard phases + progress + dashboard
// card), Portfolio insights, and the new Export screen actions (ZIP bundle + workbook import).

const EMAIL = process.env.E2E_EMAIL ?? 'raj@local.test'
const PASSWORD = process.env.E2E_PASSWORD ?? 'localtest123'

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForLoadState('networkidle')
}

test('phase pulse, portfolio, and export actions', async ({ page }) => {
  const suffix = Date.now().toString().slice(-6)
  await login(page)

  // Create a project so the run is self-contained.
  await page.goto('/projects')
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByLabel('Name', { exact: true }).fill(`E2E Phases ${suffix}`)
  await page.getByLabel('Template').selectOption('customHome')
  await page.getByLabel('Construction budget').fill('800000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/$/)

  // --- Phase Pulse: seed standard phases ---
  await page.goto('/phases')
  await page.getByRole('button', { name: 'Add standard phases' }).click()
  await expect(page.locator('.phase-row')).toHaveCount(10)
  await expect(page.locator('.panel', { hasText: 'Overall progress' })).toContainText('0%')

  // Mark the first phase 100% complete via its slider.
  await page.locator('.phase-open').first().click()
  const slider = page.getByRole('dialog').getByRole('slider')
  await slider.fill('100')
  await page.getByRole('button', { name: 'Save phase' }).click()
  // 1 of 10 at 100% → overall 10%.
  await expect(page.locator('.panel', { hasText: 'Overall progress' })).toContainText('10%')

  // --- Dashboard shows the Phase Pulse card ---
  await page.goto('/')
  await expect(page.locator('.panel', { hasText: 'Phase Pulse' })).toBeVisible()
  await expect(page.locator('.panel', { hasText: 'Phase Pulse' })).toContainText('10%')

  // --- Portfolio insights lists the project ---
  await page.goto('/portfolio')
  await expect(page.locator('.panel', { hasText: 'All projects' })).toBeVisible()
  await expect(page.getByText(`E2E Phases ${suffix}`)).toBeVisible()

  // --- Export screen exposes the new actions ---
  await page.goto('/export')
  await expect(page.getByRole('button', { name: 'Download .zip bundle' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Update budgets from workbook' })).toBeVisible()
})
