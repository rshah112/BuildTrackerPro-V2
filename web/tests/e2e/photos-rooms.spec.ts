import { test, expect, type Page } from '@playwright/test'
import { Buffer } from 'node:buffer'

// Guards the photo/room UX fixes: photo tiles render as uniform squares, tapping a photo
// opens a PREVIEW (not the edit form), and tapping a room opens its detail sheet.

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD8GO2jAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const EMAIL = process.env.E2E_EMAIL ?? 'raj@local.test'
const PASSWORD = process.env.E2E_PASSWORD ?? 'localtest123'

async function setup(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForLoadState('networkidle')

  await page.goto('/projects')
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByLabel('Name', { exact: true }).fill(`PR ${Date.now().toString().slice(-5)}`)
  await page.getByLabel('Template').selectOption('customHome')
  await page.getByLabel('Construction budget').fill('500000')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(/\/$/)
}

test('photo tiles are square; tapping previews (not edits)', async ({ page }) => {
  await setup(page)
  await page.getByRole('link', { name: 'Photos' }).click()
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Add photo' }).click()
    await page.locator('input[aria-label="Photo library"]').setInputFiles({ name: `p${i}.png`, mimeType: 'image/png', buffer: PNG })
    await page.getByRole('button', { name: 'Save photo' }).click()
    await page.waitForTimeout(300)
  }

  // Tiles are uniform squares (the aspect-ratio fix).
  const box = await page.locator('.photo-cell').first().boundingBox()
  expect(box).not.toBeNull()
  expect(Math.abs(box!.width - box!.height)).toBeLessThan(4)

  // Tapping a photo opens a PREVIEW (has "Edit details"), NOT the edit form ("Save photo").
  await page.locator('.photo-open').first().click()
  await expect(page.getByRole('button', { name: 'Edit details' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save photo' })).toHaveCount(0)
})

test('tapping a room opens its detail', async ({ page }) => {
  await setup(page)
  await page.getByRole('link', { name: 'More' }).click()
  await page.getByRole('link', { name: 'Spaces & rooms', exact: true }).click()
  await page.locator('.room-open').first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  // The Budget card (with a Variance row) always renders in the room detail.
  await expect(dialog.getByText('Variance')).toBeVisible()
})
