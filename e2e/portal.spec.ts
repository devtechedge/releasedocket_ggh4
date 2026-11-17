import { expect, test } from '@playwright/test';

test('client portal receipt is noindex and speaks to the right client', async ({
  page,
  request,
}) => {
  const res = await request.get('/portal/demo-vanguard-v1-token');
  expect(res.status()).toBe(200);
  expect(res.headers()['x-robots-tag']).toContain('noindex');

  await page.goto('/portal/demo-vanguard-v1-token');
  await expect(page.getByText('Sprint 14')).toBeVisible();
  // State varies with test order (published, accepted, or superseded by a
  // newer version published earlier in the suite), so assert the stable
  // sign-off surface instead of one specific status.
  await expect(
    page.getByRole('heading', { name: 'Client Sign-Off & Review Log' })
  ).toBeVisible();
});

test('client can post a comment on a receipt awaiting sign-off', async ({
  page,
}) => {
  await page.goto('/portal/demo-helios-v1-token');
  await page.getByPlaceholder('Sarah Jenkins').fill('Sarah Jenkins');
  await page
    .getByPlaceholder(/Record any sign-off conditions/i)
    .fill('Reviewed by our lead; looks aligned with the retainer.');
  await page.getByRole('button', { name: 'Post Comment' }).click();
  await expect(page.getByText(/Comment posted/i)).toBeVisible();
});
