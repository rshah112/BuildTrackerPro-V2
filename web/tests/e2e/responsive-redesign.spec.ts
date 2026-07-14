import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

const EMAIL = process.env.E2E_EMAIL ?? 'raj@local.test'
const PASSWORD = process.env.E2E_PASSWORD ?? 'localtest123'

async function createResponsiveProject(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForLoadState('networkidle')

  await page.goto('/projects')
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByLabel('Name', { exact: true }).fill(`Responsive ${Date.now().toString().slice(-6)}`)
  await page.getByLabel('Template').selectOption('customHome')
  await page.getByLabel('Construction budget').fill('1500000')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(/\/$/)
}

test('mobile finance workbenches reflow without horizontal page scrolling', async ({ page }) => {
  await createResponsiveProject(page)

  await expect(page.locator('.app-sidebar')).toBeHidden()
  await expect(page.locator('.tab-bar')).toBeVisible()

  await page.getByRole('link', { name: 'Budget', exact: true }).click()
  await expect(page.getByRole('table', { name: 'Budget categories' })).toBeVisible()
  await page.locator('.budget-cat', { hasText: 'Framing' }).getByRole('button').first().click()
  await expect(page.getByText('Lumber and Framing Package', { exact: true })).toBeVisible()

  const budgetWidth = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }))
  expect(budgetWidth.document).toBeLessThanOrEqual(budgetWidth.viewport)

  await page.getByRole('link', { name: 'Expenses', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Expenses', exact: true })).toBeVisible()
  const expenseWidth = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }))
  expect(expenseWidth.document).toBeLessThanOrEqual(expenseWidth.viewport)

  await page.goto('/vendors')
  await expect(page.getByRole('link', { name: 'More', exact: true })).toHaveAttribute('aria-current', 'page')

  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/budget')
  await expect(page.locator('.app-sidebar')).toBeVisible()
  await expect(page.locator('.tab-bar')).toBeHidden()
  const tabletSidebar = await page.locator('.app-sidebar').boundingBox()
  expect(tabletSidebar?.width).toBeGreaterThanOrEqual(75)
  expect(tabletSidebar?.width).toBeLessThanOrEqual(77)

  await page.setViewportSize({ width: 1536, height: 900 })
  await page.goto('/budget')
  const desktopSidebar = await page.locator('.app-sidebar').boundingBox()
  expect(desktopSidebar?.width).toBeGreaterThanOrEqual(240)
  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()
  await expect(page.locator('.app-sidebar')).toHaveCSS('width', '76px')
  const collapsedSidebar = await page.locator('.app-sidebar').boundingBox()
  expect(collapsedSidebar?.width).toBeLessThanOrEqual(80)
})
