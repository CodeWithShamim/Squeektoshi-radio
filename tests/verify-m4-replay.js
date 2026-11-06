import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function testReplayFeature() {
  console.log('Testing Replay The Day (F2) in browser...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  try {
    await page.goto('http://localhost:3000/?demo', { waitUntil: 'networkidle' });

    // Click "Replay 24 Hours" tab
    await page.click('#tab-replay');
    await page.waitForTimeout(500);

    const isReplayPanelVisible = await page.isVisible('#replay-panel');
    console.log('Replay panel visible:', isReplayPanelVisible);

    const bucketCount = await page.locator('.bucket-bar').count();
    console.log('Rendered 24-hour bucket bars:', bucketCount);

    if (bucketCount !== 24) {
      throw new Error(`Expected 24 bucket bars, but got ${bucketCount}`);
    }

    // Click "Play 24h Symphony"
    await page.click('#replay-play-btn');
    await page.waitForTimeout(1000);

    const btnText = await page.textContent('#replay-play-btn');
    console.log('Replay button text while playing:', btnText);

    const activeBarCount = await page.locator('.bucket-bar.active-hour').count();
    console.log('Active highlighted hour bar:', activeBarCount);

    const hourLabel = await page.textContent('#replay-current-hour');
    console.log('Current hour label:', hourLabel);

    if (activeBarCount === 0) {
      throw new Error('No bucket bar was highlighted as active hour!');
    }

    fs.mkdirSync(path.join(rootDir, 'tests/screenshots'), { recursive: true });
    const screenshotPath = path.join(rootDir, 'tests/screenshots/m4-replay-timeline.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Saved screenshot to:', screenshotPath);

    console.log('\nMilestone 4 Verification Succeeded!');
  } finally {
    await browser.close();
  }
}

testReplayFeature().catch((err) => {
  console.error('Replay test failed:', err);
  process.exit(1);
});

