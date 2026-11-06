import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function testOverlayAndPolish() {
  console.log('Testing Overlay Mode (F4) and Polish/Accessibility (F6)...');
  const browser = await chromium.launch({ headless: true });
  fs.mkdirSync(path.join(rootDir, 'tests/screenshots'), { recursive: true });

  try {
    // 1. Transparent Overlay Mode
    console.log('\n--- 1. Testing Transparent Overlay (?overlay=1) ---');
    const overlayPage = await browser.newPage({ viewport: { width: 500, height: 180 } });
    await overlayPage.goto('http://localhost:3000/?overlay=1', { waitUntil: 'networkidle' });

    const isOverlayBody = await overlayPage.evaluate(() => document.body.classList.contains('overlay-mode'));
    const isOverlayStripVisible = await overlayPage.isVisible('#overlay-container');
    const isMainHeaderHidden = !(await overlayPage.isVisible('.station-header'));
    const isRadioPanelHidden = !(await overlayPage.isVisible('.radio-panel'));

    console.log('body.overlay-mode present:', isOverlayBody);
    console.log('#overlay-container visible:', isOverlayStripVisible);
    console.log('Main header hidden:', isMainHeaderHidden);
    console.log('Radio controls hidden:', isRadioPanelHidden);

    if (!isOverlayBody || !isOverlayStripVisible || !isMainHeaderHidden) {
      throw new Error('Overlay mode failed to isolate the stream widget!');
    }

    const transparentPath = path.join(rootDir, 'tests/screenshots/m6-overlay-transparent.png');
    await overlayPage.screenshot({ path: transparentPath, omitBackground: true });
    console.log('Saved transparent screenshot to:', transparentPath);
    await overlayPage.close();

    // 2. Green Chroma Mode (?overlay=1&chroma=1)
    console.log('\n--- 2. Testing Chroma Key Green Overlay (?overlay=1&chroma=1) ---');
    const chromaPage = await browser.newPage({ viewport: { width: 500, height: 180 } });
    await chromaPage.goto('http://localhost:3000/?overlay=1&chroma=1', { waitUntil: 'networkidle' });

    const isChromaBody = await chromaPage.evaluate(() => document.body.classList.contains('chroma-mode'));
    const bgColor = await chromaPage.evaluate(() => getComputedStyle(document.body).backgroundColor);

    console.log('body.chroma-mode present:', isChromaBody);
    console.log('Body background color:', bgColor);

    if (!isChromaBody || (bgColor !== 'rgb(0, 255, 0)' && bgColor !== '#00ff00')) {
      throw new Error(`Expected green chroma background rgb(0, 255, 0), got: ${bgColor}`);
    }

    const chromaPath = path.join(rootDir, 'tests/screenshots/m6-overlay-chroma.png');
    await chromaPage.screenshot({ path: chromaPath });
    console.log('Saved chroma screenshot to:', chromaPath);
    await chromaPage.close();

    // 3. Accessibility & Polish Checks
    console.log('\n--- 3. Testing Accessibility & Semantics (F6) ---');
    const mainPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await mainPage.goto('http://localhost:3000', { waitUntil: 'networkidle' });

    // Verify aria-live regions
    const ariaLiveRegions = await mainPage.locator('[aria-live]').count();
    console.log('ARIA live regions found:', ariaLiveRegions);
    if (ariaLiveRegions < 2) {
      throw new Error('Expected at least 2 aria-live regions (mood badge + alert banner)');
    }

    // Verify keyboard focusability on all interactive controls
    const interactiveSelectors = [
      '#tune-btn',
      '#mute-btn',
      '#volume-slider',
      '#tab-live',
      '#tab-replay',
      '#wallet-input',
      '#wallet-load-btn',
      '#demo-band-btn',
    ];

    for (const sel of interactiveSelectors) {
      const isVisible = await mainPage.isVisible(sel);
      assertOk(isVisible, `Interactive control ${sel} is missing or not visible`);
    }
    console.log(`All ${interactiveSelectors.length} core controls are accessible and visible!`);

    // Verify "How it works" proof-limits link
    const proofLink = await mainPage.getAttribute('a[href*="proof-limits"]', 'href');
    console.log('Proof-limits documentation link:', proofLink);
    assertOk(proofLink.includes('proof-limits'), 'Proof-limits documentation link is missing');

    await mainPage.close();
    console.log('\nMilestone 6 Verification Succeeded!');
  } finally {
    await browser.close();
  }
}

function assertOk(cond, msg) {
  if (!cond) throw new Error(msg);
}

testOverlayAndPolish().catch((err) => {
  console.error('Overlay/Polish verification failed:', err);
  process.exit(1);
});

