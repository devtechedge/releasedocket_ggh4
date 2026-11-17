import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = 'docs/screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

async function shot(name, url, prepare) {
  await page.goto(url, { waitUntil: 'networkidle' });
  if (prepare) await prepare(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}`, fullPage: false });
  console.log(`captured ${name}`);
}

await shot('01-landing.png', `${BASE}/`);

const res = await context.request.post(`${BASE}/api/auth/demo`);
if (!res.ok()) throw new Error(`demo login failed: ${res.status()}`);

await shot('02-dashboard.png', `${BASE}/dashboard`);
await shot('03-clients.png', `${BASE}/dashboard/clients`);
await shot('06-reports.png', `${BASE}/dashboard/reports`);

await page.goto(`${BASE}/dashboard/delivery`, { waitUntil: 'networkidle' });
await page.getByRole('link', { name: /Sprint 14/ }).first().click();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/04-delivery-editor.png` });
console.log('captured 04-delivery-editor.png');

await shot('05-client-portal.png', `${BASE}/portal/demo-vanguard-v1-token`);

await browser.close();
