import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const artifactDir = '/Users/shamimislam/.gemini/antigravity/brain/91fae6fa-8c50-48b4-98ad-6907014423d5';
const localDir = path.resolve('tests/screenshots');
fs.mkdirSync(localDir, { recursive: true });

async function saveProof(page, filename) {
  const localPath = path.join(localDir, filename);
  const artifactPath = path.join(artifactDir, filename);
  await page.screenshot({ path: localPath, fullPage: false });
  fs.copyFileSync(localPath, artifactPath);
  console.log(`Saved screenshot: ${filename}`);
}

async function run() {
  console.log('Capturing station console proofs across resolutions and states...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  const viewports = [
    { name: '1440', width: 1440, height: 900 },
    { name: '768', width: 768, height: 1024 },
    { name: '360', width: 360, height: 780 },
  ];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });

    // 1. Before Tune (Idle)
    await page.goto('http://localhost:3000/app.html?demo');
    await page.waitForTimeout(600);
    await saveProof(page, `proof-app-${vp.name}-before-tune.png`);

    // 2. Tuned in Sleep
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
    await page.goto('http://localhost:3000/app.html');
    await page.waitForTimeout(600);
    await page.locator('#tune-btn').click();
    await page.waitForTimeout(700);
    await saveProof(page, `proof-app-${vp.name}-tuned-sleep.png`);

    // 3. Tuned in Jog
    await page.route('**/v1/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schemaVersion: 1,
          measurement: { freshness: 'online', coreStatus: 'ACTIVE', rpmMilli: 45000 },
          builder: { status: 'available', anchor: { blockHeight: '1205', blockProgress: '450000000' } },
        }),
      });
    });
    await page.goto('http://localhost:3000/app.html');
    await page.waitForTimeout(600);
    await page.locator('#tune-btn').click();
    await page.waitForTimeout(700);
    await saveProof(page, `proof-app-${vp.name}-tuned-jog.png`);

    // 4. Tuned in Zoomies
    await page.route('**/v1/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schemaVersion: 1,
          measurement: { freshness: 'online', coreStatus: 'SPINNING', rpmMilli: 75000 },
          builder: { status: 'available', anchor: { blockHeight: '1210', blockProgress: '820000000' } },
        }),
      });
    });
    await page.goto('http://localhost:3000/app.html');
    await page.waitForTimeout(600);
    await page.locator('#tune-btn').click();
    await page.waitForTimeout(700);
    await saveProof(page, `proof-app-${vp.name}-tuned-zoomies.png`);

    // 5. Unknown / Unavailable Status
    await page.route('**/v1/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schemaVersion: 1,
          status: 'unavailable',
          reason: 'indexer_unavailable',
        }),
      });
    });
    await page.goto('http://localhost:3000/app.html');
    await page.waitForTimeout(800);
    await saveProof(page, `proof-app-${vp.name}-unknown-signal.png`);

    // 6. Empty Wallet
    await page.unroute('**/v1/status');
    await page.goto('http://localhost:3000/app.html?demo');
    await page.waitForTimeout(500);
    await page.locator('#tab-band').click();
    await page.waitForTimeout(400);
    // Enter empty wallet address
    await page.locator('#wallet-input').fill('0x0000000000000000000000000000000000000000');
    // Mock tokens endpoint to return empty
    await page.route('**/v1/account/*/tokens', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schemaVersion: 1,
          tokens: [],
          custodyCount: 0,
        }),
      });
    });
    await page.locator('#wallet-load-btn').click();
    await page.waitForTimeout(600);
    await saveProof(page, `proof-app-${vp.name}-empty-wallet.png`);

    // 7. Band Loaded with Seated Markers
    await page.route('**/v1/account/*/tokens', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schemaVersion: 1,
          tokens: [
            { tokenId: '101', role: 'chords', level: 3, energyPct: 85 },
            { tokenId: '202', role: 'bass', level: 5, energyPct: 90 },
            { tokenId: '303', role: 'arpeggio', level: 2, energyPct: 70 },
          ],
          custodyCount: 3,
        }),
      });
    });
    await page.locator('#wallet-load-btn').click();
    await page.waitForTimeout(800);
    await saveProof(page, `proof-app-${vp.name}-band-loaded.png`);

    await page.close();
  }

  // 8. OBS Stream Overlay Mode
  const overlayPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await overlayPage.goto('http://localhost:3000/app.html?overlay=1&demo');
  await overlayPage.waitForTimeout(1000);
  await saveProof(overlayPage, 'proof-app-overlay-stream.png');
  await overlayPage.close();

  await browser.close();
  console.log('All proofs captured successfully!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
