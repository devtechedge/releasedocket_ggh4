import { expect, test } from '@playwright/test';

test('agency can create a client and a project', async ({ page }) => {
  const stamp = Date.now().toString(36);
  const clientName = `Acme Logistics ${stamp}`;
  const projectName = `Order Routing ${stamp}`;

  await page.goto('/dashboard/clients');
  await page.getByRole('button', { name: 'New Client' }).click();
  await page.getByPlaceholder('Acme Logistics').fill(clientName);
  await page.getByPlaceholder('Dana Rivera').fill('Dana Rivera');
  await page
    .getByPlaceholder('dana@acmelogistics.example')
    .fill(`dana+${stamp}@acmelogistics.example`);
  await page.getByRole('button', { name: 'Save Client' }).click();
  await expect(
    page.getByRole('cell', { name: clientName })
  ).toBeVisible();

  await page.goto('/dashboard/projects');
  await page.getByRole('button', { name: 'New Project' }).click();
  await page.getByPlaceholder('Order Routing Engine').fill(projectName);
  await page
    .getByPlaceholder('https://staging.client.example')
    .fill(`https://staging.${stamp}.example`);
  await page
    .getByPlaceholder('Webhook ingestion and dispatch portal')
    .fill('Webhook ingestion and dispatch portal');
  await page.getByRole('button', { name: 'Create Project' }).click();
  await expect(
    page.getByRole('heading', { name: projectName })
  ).toBeVisible();
});

test('agency can create a batch with a criterion from the delivery page', async ({
  page,
}) => {
  await page.goto('/dashboard/delivery');
  await page.getByRole('button', { name: 'New Delivery Batch' }).click();
  await page
    .getByPlaceholder('Sprint 15 — Webhook Signature Hardening')
    .fill('E2E Sprint — Webhook Signature Hardening');
  await page
    .getByPlaceholder(
      'Implemented HMAC verification and idempotent webhook ingestion for carrier events.'
    )
    .fill('Implemented HMAC verification and idempotent webhook ingestion for carrier events.');
  await page
    .getByPlaceholder('Reject invalid webhook signatures with HTTP 401')
    .fill('Reject invalid webhook signatures with HTTP 401');
  await page.getByRole('button', { name: 'Create & Open Batch' }).click();

  await expect(page).toHaveURL(/\/dashboard\/delivery\/[\w-]+$/);
  await expect(
    page.getByRole('heading', { name: 'Human-written acceptance criteria' })
  ).toBeVisible();
});

test('a seeded batch can publish a new immutable receipt version and be accepted', async ({
  page,
}) => {
  await page.goto('/dashboard/delivery');
  await page.getByRole('link', { name: /Sprint 14/ }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/delivery\/[\w-]+$/);

  await page.getByRole('button', { name: /04\. Preview & Publish/ }).click();
  await page
    .getByRole('checkbox', { name: /I acknowledge these evidence gaps/i })
    .check();
  await page.getByRole('button', { name: /Publish Receipt v\d+/ }).click();
  await expect(
    page.getByText(/Published immutable Delivery Receipt/)
  ).toBeVisible();

  const portalLink = page.locator('a[href^="/portal/"]').last();
  await expect(portalLink).toBeVisible();
  const href = await portalLink.getAttribute('href');
  expect(href).toBeTruthy();

  await page.goto(href!);
  await expect(page.getByText('Sprint 14')).toBeVisible();
  const nameInput = page.getByPlaceholder('Sarah Jenkins');
  if (await nameInput.count()) {
    await nameInput.fill('Sarah Jenkins');
  }
  await page.getByRole('button', { name: 'Accept Delivery Receipt' }).click();
  await expect(page.getByText(/accepted/i).first()).toBeVisible();
});
