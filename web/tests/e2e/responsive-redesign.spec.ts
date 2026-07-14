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

test('dashboard expense tiles stay contained and keep vendor names readable', async ({ page }) => {
  await createResponsiveProject(page)

  const vendor = 'N. O. T. S. L.'
  const category = 'General Requirements & Soft Costs'

  await page.getByRole('link', { name: 'Expenses', exact: true }).click()
  await page.getByRole('button', { name: 'Add expense' }).click()
  await page.getByLabel('Vendor', { exact: true }).fill(vendor)
  await page.getByLabel('Amount', { exact: true }).fill('5000')
  await page.getByText('More details', { exact: true }).click()
  await page.getByLabel('Category', { exact: true }).fill(category)
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.getByText(vendor, { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()

  const card = page.locator('.panel').filter({
    has: page.getByRole('heading', { name: 'Recent expenses', exact: true }),
  })
  const row = card.locator('.dashboard-expense-list a').filter({ hasText: vendor })
  await expect(row).toBeVisible()

  const metrics = await row.evaluate((link, expectedVendor) => {
    const cardNode = link.closest('.panel')
    const vendorNode = Array.from(link.querySelectorAll('strong')).find(
      (node) => node.textContent?.trim() === expectedVendor,
    )
    const metaNode = link.querySelector('.dashboard-expense-meta')
    const amountNode = link.querySelector(':scope > strong')

    if (
      !(cardNode instanceof HTMLElement) ||
      !(vendorNode instanceof HTMLElement) ||
      !(metaNode instanceof HTMLElement) ||
      !(amountNode instanceof HTMLElement)
    ) {
      throw new Error('Expected dashboard expense layout nodes')
    }

    const cardRect = cardNode.getBoundingClientRect()
    const rowRect = link.getBoundingClientRect()
    const vendorRect = vendorNode.getBoundingClientRect()
    const metaRect = metaNode.getBoundingClientRect()
    const amountRect = amountNode.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(vendorNode)

    return {
      viewportWidth: window.innerWidth,
      documentWidth: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
      cardLeft: cardRect.left,
      cardRight: cardRect.right,
      rowRight: rowRect.right,
      amountRight: amountRect.right,
      vendorLeft: vendorRect.left,
      vendorWidth: vendorRect.width,
      vendorHeight: vendorRect.height,
      vendorBottom: vendorRect.bottom,
      vendorLines: new Set(
        Array.from(range.getClientRects()).map((rect) => Math.round(rect.top)),
      ).size,
      metaLeft: metaRect.left,
      metaTop: metaRect.top,
    }
  }, vendor)

  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth)
  expect(metrics.cardLeft).toBeGreaterThanOrEqual(-1)
  expect(metrics.cardRight).toBeLessThanOrEqual(metrics.viewportWidth + 1)
  expect(metrics.rowRight).toBeLessThanOrEqual(metrics.cardRight + 1)
  expect(metrics.amountRight).toBeLessThanOrEqual(metrics.cardRight + 1)
  expect(Math.abs(metrics.vendorLeft - metrics.metaLeft)).toBeLessThanOrEqual(1)
  expect(metrics.metaTop).toBeGreaterThanOrEqual(metrics.vendorBottom - 1)
  expect(metrics.vendorLines).toBeLessThanOrEqual(2)
  expect(metrics.vendorWidth).toBeGreaterThanOrEqual(64)
  expect(metrics.vendorWidth / metrics.vendorHeight).toBeGreaterThan(1.5)
})
