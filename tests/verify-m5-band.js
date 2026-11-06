import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const REAL_WALLET_WITH_SQUEEKS = '0x798cf7770337a9283b6f2af69a8f079b3d7544dc';
const EMPTY_WALLET = '0x0000000000000000000000000000000000000002';

async function testBandMode() {
  console.log('Testing Squeek Band Mode (F3) with Real & Empty Wallets...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  fs.mkdirSync(path.join(rootDir, 'tests/screenshots'), { recursive: true });

  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

    // --- TEST 1: Empty Wallet ---
    console.log('\n--- 1. Testing Empty Wallet ---');
    await page.fill('#wallet-input', EMPTY_WALLET);
    await page.click('#wallet-load-btn');
    await page.waitForTimeout(2000);

    const emptyMsg = await page.textContent('#band-status-msg');
    console.log('Empty wallet message:', emptyMsg);

    const emptyCardsCount = await page.locator('.squeek-card').count();
    console.log('Empty wallet card count:', emptyCardsCount);

    if (emptyCardsCount !== 0) {
      throw new Error(`Expected 0 cards for empty wallet, got ${emptyCardsCount}`);
    }
    if (!emptyMsg.includes('no Squeeks')) {
      throw new Error('Expected friendly empty wallet message!');
    }

    await page.screenshot({
      path: path.join(rootDir, 'tests/screenshots/m5-band-empty-wallet.png'),
      fullPage: true,
    });

    // --- TEST 2: Demo Band Button ---
    console.log('\n--- 2. Testing Demo Band Button ---');
    await page.click('#demo-band-btn');
    await page.waitForTimeout(500);

    const demoCardsCount = await page.locator('.squeek-card').count();
    console.log('Demo band cards rendered:', demoCardsCount);
    if (demoCardsCount !== 5) {
      throw new Error(`Expected 5 demo cards, got ${demoCardsCount}`);
    }

    // --- TEST 3: Real Wallet with Squeeks ---
    console.log(`\n--- 3. Testing Real Wallet with Squeeks: ${REAL_WALLET_WITH_SQUEEKS} ---`);
    await page.fill('#wallet-input', REAL_WALLET_WITH_SQUEEKS);
    await page.click('#wallet-load-btn');

    // Wait for tokens and metadata to load
    await page.waitForSelector('.squeek-card', { timeout: 10000 });
    await page.waitForTimeout(3000); // Wait for card images to render

    const realCardsCount = await page.locator('.squeek-card').count();
    console.log('Real wallet cards rendered:', realCardsCount);

    const bandMsg = await page.textContent('#band-status-msg');
    console.log('Band active message:', bandMsg);

    const firstCardText = await page.locator('.squeek-card').first().textContent();
    console.log('Sample Squeek Card Content:', firstCardText);

    if (realCardsCount < 1) {
      throw new Error('No Squeek cards were rendered for the real wallet!');
    }

    const realScreenshot = path.join(rootDir, 'tests/screenshots/m5-band-real-wallet.png');
    await page.screenshot({ path: realScreenshot, fullPage: true });
    console.log('Saved screenshot to:', realScreenshot);

    console.log('\nMilestone 5 Verification Succeeded!');
  } finally {
    await browser.close();
  }
}

testBandMode().catch((err) => {
  console.error('Band mode verification failed:', err);
  process.exit(1);
});

