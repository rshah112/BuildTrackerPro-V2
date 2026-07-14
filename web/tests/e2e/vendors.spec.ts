import { test, expect } from '@playwright/test'

// Vendors flow against the local Supabase stack: sign in → create a project →
// open Vendors → add a vendor via the editor sheet → it shows in the list, then
// edit it. Guards the useEditor/<EditorSheet> + <Form> refactors (accessible names
// must stay stable). Requires `supabase start` + the seeded test user.

const EMAIL = process.env.E2E_EMAIL ?? 'raj@local.test'
const PASSWORD = process.env.E2E_PASSWORD ?? 'localtest123'

test('vendors: create project → add vendor → edit vendor', async ({ page }) => {
  const suffix = Date.now().toString().slice(-6)
  const projectName = `E2E Vendors ${suffix}`

  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).toHaveURL(/\/projects/)

  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByLabel('Name', { exact: true }).fill(projectName)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/$/)

  // Navigate to Vendors via the More tab.
  await page.getByRole('link', { name: 'More' }).click()
  await expect(page).toHaveURL(/\/more$/)
  await page.getByRole('link', { name: 'Vendors', exact: true }).click()
  await expect(page).toHaveURL(/\/vendors$/)
  await expect(page.getByRole('heading', { name: 'Vendors', exact: true })).toBeVisible()

  // Empty state offers the add CTA.
  await page.getByRole('button', { name: 'Add vendor' }).click()
  await expect(page.getByRole('dialog', { name: 'New vendor' })).toBeVisible()
  await page.getByLabel('Name', { exact: true }).fill('Ace Plumbing')
  await page.getByLabel('Trade').fill('Plumbing')
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  // Row appears.
  await expect(page.getByText('Ace Plumbing')).toBeVisible()

  // Open the operations profile, then move into the contact editor.
  await page.getByRole('button', { name: 'Open Ace Plumbing details' }).click()
  await expect(page.getByRole('dialog', { name: 'Ace Plumbing' })).toBeVisible()
  await page.getByRole('button', { name: 'Edit contact details' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit vendor' })).toBeVisible()
})
