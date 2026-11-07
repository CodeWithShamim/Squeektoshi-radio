import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const artifactDir = '/Users/shamimislam/.gemini/antigravity/brain/91fae6fa-8c50-48b4-98ad-6907014423d5';
const localDir = path.resolve('tests/screenshots');

async function run() {
  console.log('Running real API verification at 1440px and 360px...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  // 1. Real API Desktop (1440px)
  const page1440 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page1440.goto('http://localhost:3000/app.html');
  await page1440.waitForTimeout(3000); // Allow real fetch to complete
  const local1440 = path.join(localDir, 'proof-real-api-1440.png');
  const art1440 = path.join(artifactDir, 'proof-real-api-1440.png');
  await page1440.screenshot({ path: local1440 });
  fs.copyFileSync(local1440, art1440);
  console.log('Saved proof-real-api-1440.png');
  await page1440.close();

  // 2. Real API Mobile (360px)
  const page360 = await browser.newPage({ viewport: { width: 360, height: 780 } });
  await page360.goto('http://localhost:3000/app.html');
  await page360.waitForTimeout(3000); // Allow real fetch to complete
  const local360 = path.join(localDir, 'proof-real-api-360.png');
  const art360 = path.join(artifactDir, 'proof-real-api-360.png');
  await page360.screenshot({ path: local360 });
  fs.copyFileSync(local360, art360);
  console.log('Saved proof-real-api-360.png');
  await page360.close();

  await browser.close();
  console.log('Real API proofs captured successfully!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

