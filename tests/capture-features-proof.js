import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

async function captureProof() {
  const screenshotsDir = path.resolve('tests/screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  // 1. Console Drawer Open
  console.log('Capturing Console Drawer...');
  await page.goto('http://localhost:3000/app.html?demo');
  await page.waitForTimeout(1000);
  await page.locator('#btn-open-console').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(screenshotsDir, 'proof-console-drawer.png'), fullPage: true });

  // 2. Diagnostics Panel Open
  console.log('Capturing Diagnostics Panel...');
  await page.locator('#console-close-btn').click();
  await page.waitForTimeout(300);
  await page.locator('#btn-open-diag').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(screenshotsDir, 'proof-diagnostics-panel.png'), fullPage: true });

  // 3. Band Mode & Squeek Spotlight
  console.log('Capturing Band Mode & Spotlight...');
  await page.locator('#diag-close-btn').click();
  await page.waitForTimeout(300);
  await page.locator('#tab-band').click();
  await page.waitForTimeout(800);
  // Click first card to spotlight
  const firstCard = page.locator('.squeek-card').first();
  if (await firstCard.isVisible()) {
    await firstCard.click();
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: path.join(screenshotsDir, 'proof-band-spotlight.png'), fullPage: true });

  // 4. Replay Day with Timeline
  console.log('Capturing Replay Day...');
  await page.locator('#tab-replay').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(screenshotsDir, 'proof-replay-timeline.png'), fullPage: true });

  await browser.close();
  console.log('✅ Proof screenshots captured successfully.');
}

captureProof().catch((err) => {
  console.error('Error capturing proof:', err);
  process.exit(1);
});

