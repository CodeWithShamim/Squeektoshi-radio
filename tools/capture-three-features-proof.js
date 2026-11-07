import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const screenshotsDir = path.join(rootDir, 'tests/screenshots');

async function captureAllProofs() {
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  // ==========================================
  // 1. DESKTOP (1440px) RECORDING & SCREENSHOTS
  // ==========================================
  console.log('Capturing Desktop 1440px proofs and video recording...');
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: screenshotsDir,
      size: { width: 1440, height: 900 },
    },
  });

  const page = await desktopContext.newPage();
  await page.goto('http://localhost:3000/app.html?demo');
  await page.waitForTimeout(1000);

  // Tab Title Idle -> Playing check
  const titlePlaying = await page.title();
  console.log('Title playing:', titlePlaying);

  // 1A. Proof: Initial Station with first-visit hint or tuned in
  await page.screenshot({ path: path.join(screenshotsDir, 'proof-m2-station-1440.png'), fullPage: true });

  // 1B. Best Hour Playback: Click #btn-best-hour
  console.log('Triggering Best Hour on desktop...');
  await page.locator('#btn-best-hour').click();
  await page.waitForTimeout(1200);

  // Screenshot Best Hour HUD & Ring Highlight
  await page.screenshot({ path: path.join(screenshotsDir, 'proof-m2-best-hour-playing-1440.png'), fullPage: true });

  // 1C. Best Hour in Console Drawer
  await page.locator('#btn-open-console').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(screenshotsDir, 'proof-m2-best-hour-console-1440.png'), fullPage: true });
  await page.locator('#console-close-btn').click();
  await page.waitForTimeout(400);

  // 1D. Return to Live cleanly
  await page.locator('#btn-header-live').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(screenshotsDir, 'proof-m2-returned-live-1440.png'), fullPage: true });

  // 1E. Feature 1: Share Poster Flow
  console.log('Opening Share Poster on desktop...');
  await page.locator('#btn-share-band').click();
  await page.waitForTimeout(800);

  // Landscape Preview (1200x630)
  await page.screenshot({ path: path.join(screenshotsDir, 'proof-m3-poster-modal-landscape-1440.png'), fullPage: true });

  // Switch to Square (1080x1080)
  await page.locator('#poster-format-control [data-format="square"]').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(screenshotsDir, 'proof-m3-poster-modal-square-1440.png'), fullPage: true });

  // Switch to Portrait (1080x1350)
  await page.locator('#poster-format-control [data-format="portrait"]').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(screenshotsDir, 'proof-m3-poster-modal-portrait-1440.png'), fullPage: true });

  // Export actual PNG files of each format directly from canvas
  await page.evaluate(async () => {
    const { renderBandPoster } = await import('/src/share/poster.js');
    const demoTokens = [
      { tokenId: '1', level: 5, numericBasePower: 3200 },
      { tokenId: '18', level: 4, numericBasePower: 2800 },
      { tokenId: '42', level: 3, numericBasePower: 2200 },
      { tokenId: '89', level: 3, numericBasePower: 1900 },
      { tokenId: '112', level: 2, numericBasePower: 1600 },
      { tokenId: '256', level: 2, numericBasePower: 1400 },
      { tokenId: '304', level: 1, numericBasePower: 1100 },
      { tokenId: '512', level: 1, numericBasePower: 950 },
    ];
    const wave = new Uint8Array(128);
    for (let i = 0; i < 128; i++) wave[i] = 128 + Math.round(Math.sin(i * 0.15) * 40);

    const baseOpts = {
      status: { isAvailable: true, freshness: 'online', mood: 'jog', blockHeight: 2366, blockProgressRatio: 0.65 },
      bpm: 112,
      keyInfo: { rootName: 'D', scaleName: 'Dorian' },
      palette: 'analog',
      tokens: demoTokens,
      waveformSample: wave,
      privacy: 'hide',
      fixedTimestamp: '2026-11-06T14:00:00.000Z',
    };

    window.__exportPoster = async (fmt) => {
      const c = document.createElement('canvas');
      await renderBandPoster(c, { ...baseOpts, format: fmt });
      return c.toDataURL('image/png');
    };
  });

  const formats = ['landscape', 'square', 'portrait'];
  for (const fmt of formats) {
    const dataUrl = await page.evaluate(async (f) => window.__exportPoster(f), fmt);
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(path.join(screenshotsDir, `proof-poster-${fmt}.png`), base64Data, 'base64');
    console.log(`Saved proof-poster-${fmt}.png`);
  }

  // Close modal
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Close desktop context and save video
  await page.close();
  await desktopContext.close();

  // ==========================================
  // 2. MOBILE (360px) SCREENSHOTS
  // ==========================================
  console.log('Capturing Mobile 360px proofs...');
  const mobileContext = await browser.newContext({
    viewport: { width: 360, height: 780 },
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('http://localhost:3000/app.html?demo');
  await mobilePage.waitForTimeout(1000);

  // Mobile station
  await mobilePage.screenshot({ path: path.join(screenshotsDir, 'proof-mobile-360-station.png'), fullPage: true });

  // Mobile Best Hour
  await mobilePage.locator('#btn-best-hour').scrollIntoViewIfNeeded();
  await mobilePage.locator('#btn-best-hour').click();
  await mobilePage.waitForTimeout(800);
  await mobilePage.screenshot({ path: path.join(screenshotsDir, 'proof-mobile-360-best-hour.png'), fullPage: true });

  // Mobile Share Modal
  await mobilePage.locator('#btn-share-band').scrollIntoViewIfNeeded();
  await mobilePage.locator('#btn-share-band').click();
  await mobilePage.waitForTimeout(800);
  await mobilePage.screenshot({ path: path.join(screenshotsDir, 'proof-mobile-360-share-modal.png'), fullPage: true });

  await mobilePage.close();
  await mobileContext.close();

  await browser.close();
  console.log('✅ All visual proofs and recordings captured successfully.');
}

captureAllProofs().catch((err) => {
  console.error('Error capturing proofs:', err);
  process.exit(1);
});

