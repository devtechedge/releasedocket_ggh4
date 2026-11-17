import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export default async function globalSetup() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const res = await context.request.post('http://localhost:3000/api/auth/demo');
  if (!res.ok()) {
    throw new Error(`Demo login failed in global setup: ${res.status()} ${await res.text()}`);
  }
  await context.storageState({ path: join('e2e', '.auth', 'demo.json') });
  await browser.close();
}
