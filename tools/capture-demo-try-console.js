import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const artifactDir = '/Users/shamimislam/.gemini/antigravity/brain/2f8c3645-b02f-4cc0-a21f-30caae07435f';
const localDir = path.resolve('tests/screenshots');
fs.mkdirSync(localDir, { recursive: true });
fs.mkdirSync(artifactDir, { recursive: true });

async function saveProof(page, filename) {
  const localPath = path.join(localDir, filename);
  const artifactPath = path.join(artifactDir, filename);
  await page.screenshot({ path: localPath, fullPage: false });
  fs.copyFileSync(localPath, artifactPath);
  console.log(`Saved proof: ${filename}`);
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    // Mock status as IDLE (sleep mood)
    await page.route('**/v1/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schemaVersion: 1,
          measurement: { freshness: 'online', coreStatus: 'IDLE', rpmMilli: 0 },
          builder: { status: 'available', anchor: { blockHeight: '1200', blockProgress: '150000000' } },
        }),
      });
    });

    // 1. Sleep mood with Demo Try highlight button and header Console button
    await page.goto('http://localhost:3000/app.html');
    await page.waitForTimeout(800);
    await saveProof(page, 'proof-mood-sleep-demo-try.png');

    // 2. Open Console drawer via Header Right Console button
    await page.locator('#btn-header-console').click();
    await page.waitForTimeout(400);
    await saveProof(page, 'proof-header-console-open.png');

    // 3. Close Console drawer and click Demo Try -> enters demo mode & shows "Live" button
    await page.locator('#console-close-btn').click();
    await page.waitForTimeout(400);
    await page.locator('#btn-demo-try').click();
    await page.waitForTimeout(600);
    await saveProof(page, 'proof-demo-try-active.png');

    // 4. Click the "Live" button to switch back to Live mode
    await page.locator('#btn-header-live').click();
    await page.waitForTimeout(600);
    await saveProof(page, 'proof-switched-back-to-live.png');

    console.log('All proofs captured successfully.');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
