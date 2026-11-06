import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function testVisualizerAndResilience() {
  console.log('Testing Visualizers and F5 Resilience...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  try {
    await page.goto('http://localhost:3000/?demo', { waitUntil: 'networkidle' });
    await page.click('#tune-btn');
    await page.waitForTimeout(1000);

    // 1. Verify canvas rendering & wheel rotation
    const canvasStatus = await page.evaluate(async () => {
      const wheelCanvas = document.getElementById('wheel-canvas');
      const scopeCanvas = document.getElementById('scope-canvas');

      const wheelCtx = wheelCanvas.getContext('2d');
      const scopeCtx = scopeCanvas.getContext('2d');

      const wheelPixels = wheelCtx.getImageData(0, 0, wheelCanvas.width, wheelCanvas.height).data;
      const scopePixels = scopeCtx.getImageData(0, 0, scopeCanvas.width, scopeCanvas.height).data;

      // Count non-zero alpha/color pixels to verify drawings
      let wheelDrawn = 0;
      let scopeDrawn = 0;
      for (let i = 0; i < wheelPixels.length; i += 4) {
        if (wheelPixels[i + 3] > 0) wheelDrawn++;
      }
      for (let i = 0; i < scopePixels.length; i += 4) {
        if (scopePixels[i + 3] > 0) scopeDrawn++;
      }

      return {
        wheelDrawn,
        scopeDrawn,
        totalPixels: wheelCanvas.width * wheelCanvas.height,
      };
    });

    console.log('--- Canvas Rendering Verification ---');
    console.log('Wheel canvas active pixels:', canvasStatus.wheelDrawn);
    console.log('Oscilloscope canvas active pixels:', canvasStatus.scopeDrawn);

    if (canvasStatus.wheelDrawn === 0 || canvasStatus.scopeDrawn === 0) {
      throw new Error('Canvases are blank or not rendering!');
    }

    // 2. Test F5 Resilience: simulate unavailable status
    console.log('\n--- Testing F5 Resilience (Unavailable / Stale) ---');
    const resilienceResult = await page.evaluate(async () => {
      const { updateUI, state } = await import('/src/main.js');

      // Preserve last good values
      const initialBlock = state.status?.blockHeight;

      // Trigger unavailable event
      const unavailableStatus = {
        status: 'unavailable',
        reason: 'indexer_unavailable',
        isAvailable: false,
        freshness: 'unavailable',
        blockHeight: initialBlock,
      };
      updateUI(unavailableStatus);

      const banner = document.getElementById('status-banner');
      const bannerVisible = banner.classList.contains('visible');
      const moodBadge = document.getElementById('badge-mood').textContent;

      return {
        bannerVisible,
        moodBadge,
        preservedBlock: document.getElementById('val-block-height').textContent,
      };
    });

    console.log('Status banner visible on unavailable:', resilienceResult.bannerVisible);
    console.log('Mood badge in unavailable state:', resilienceResult.moodBadge);
    console.log('Preserved block height:', resilienceResult.preservedBlock);

    if (!resilienceResult.bannerVisible) {
      throw new Error('Banner was not displayed on unavailable status!');
    }
    if (resilienceResult.moodBadge !== 'UNKNOWN') {
      throw new Error('Mood did not transition to UNKNOWN on unavailable status!');
    }

    // Capture visualizer screenshot
    fs.mkdirSync(path.join(rootDir, 'tests/screenshots'), { recursive: true });
    const screenshotPath = path.join(rootDir, 'tests/screenshots/m3-visualizer-resilience.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('\nScreenshot saved to:', screenshotPath);

    console.log('\nMilestone 3 Verification Succeeded!');
  } finally {
    await browser.close();
  }
}

testVisualizerAndResilience().catch((err) => {
  console.error('Visualizer/Resilience test failed:', err);
  process.exit(1);
});

