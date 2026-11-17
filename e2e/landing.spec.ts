import { expect, test } from '@playwright/test';

test('landing page renders hero and demo entry points', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /Delivery Receipts/i }).first()
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Launch Seeded Demo' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Sign In' }).first()
  ).toBeVisible();
});

test('demo session opens the agency dashboard', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByText('Northstar Digital Studio', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Clients', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Delivery', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Reports', exact: true })
  ).toBeVisible();
});
