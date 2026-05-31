import { test, expect, type Page } from '@playwright/test'

// Geometry-based layout guards on a mobile viewport. These catch the two real rendering
// bugs that headless functional tests missed: (1) the currency "$" prefix overlapping the
// first typed digit, and (2) a grid column's empty date input stretching tall enough to
// overlap its neighbor. Deterministic measurements, not flaky pixel snapshots.

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

const EMAIL = process.env.E2E_EMAIL ?? 'raj@local.test'
const PASSWORD = process.env.E2E_PASSWORD ?? 'localtest123'

async function loginAndOpenExpense(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForLoadState('networkidle')

  await page.goto('/projects')
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByLabel('Name', { exact: true }).fill(`Layout ${Date.now().toString().slice(-5)}`)
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(/\/$/)

  await page.getByRole('link', { name: 'Expenses' }).click()
  await page.getByRole('button', { name: 'Add expense' }).click()
}

test('currency "$" prefix never overlaps the entered amount', async ({ page }) => {
  await loginAndOpenExpense(page)
  await page.getByLabel('Amount', { exact: true }).fill('55555')

  const geo = await page.evaluate(() => {
    const prefix = document.querySelector('.currency-prefix') as HTMLElement
    const input = document.querySelector('.currency-input input') as HTMLElement
    const ir = input.getBoundingClientRect()
    const textStart = ir.left + parseFloat(getComputedStyle(input).paddingLeft)
    return { textStart, prefixRight: prefix.getBoundingClientRect().right }
  })
  // The text must begin to the RIGHT of where the "$" ends, with a small gap.
  expect(geo.textStart).toBeGreaterThan(geo.prefixRight + 3)
})

test('paired date fields stay equal height and do not overlap', async ({ page }) => {
  await loginAndOpenExpense(page)
  const due = await page.getByLabel('Due date').boundingBox()
  const exp = await page.getByLabel('Expected payment').boundingBox()
  expect(due).not.toBeNull()
  expect(exp).not.toBeNull()
  // Same row → near-equal heights (the stretch bug made "Due date" much taller).
  expect(Math.abs(due!.height - exp!.height)).toBeLessThan(6)
  // And the left input must not run down past the row into the neighbor's hint.
  expect(due!.height).toBeLessThan(70)
})
