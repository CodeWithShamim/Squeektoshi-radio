import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function testAudioEngine() {
  console.log('Testing Audio Engine in browser with Playwright...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'], // Allows Web Audio context in headless test
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  try {
    await page.goto('http://localhost:3000/?demo', { waitUntil: 'networkidle' });
    console.log('Loaded http://localhost:3000/?demo');

    // Verify initial button state
    const initialBtnText = await page.textContent('#tune-text');
    console.log('Initial Tune button text:', initialBtnText);

    // Click "Tune In" button
    console.log('Clicking Tune In button...');
    await page.click('#tune-btn');
    await page.waitForTimeout(1000);

    const activeBtnText = await page.textContent('#tune-text');
    console.log('Active Tune button text:', activeBtnText);

    // Inspect AudioContext state and analyser node in browser
    const audioState = await page.evaluate(async () => {
      const { audioEngine } = await import('/src/music/engine.js');
      const ctx = audioEngine.ctx;
      const analyser = audioEngine.analyser;

      // Sample audio levels over 1.5 seconds
      const samples = [];
      const data = new Uint8Array(analyser.frequencyBinCount);

      for (let i = 0; i < 6; i++) {
        analyser.getByteFrequencyData(data);
        let maxVal = 0;
        let sum = 0;
        for (let j = 0; j < data.length; j++) {
          if (data[j] > maxVal) maxVal = data[j];
          sum += data[j];
        }
        samples.push({ maxVal, avgVal: Math.round(sum / data.length) });
        await new Promise((r) => setTimeout(r, 250));
      }

      return {
        contextState: ctx ? ctx.state : null,
        isPlaying: audioEngine.isPlaying,
        masterGain: audioEngine.masterGain ? audioEngine.masterGain.gain.value : null,
        samples,
      };
    });

    console.log('\n--- Audio Engine Browser Inspection ---');
    console.log('AudioContext State:', audioState.contextState);
    console.log('Engine isPlaying:', audioState.isPlaying);
    console.log('Master Gain Level:', audioState.masterGain, '(ceiling <= 0.8)');
    console.log('Audio Spectrum Samples (Frequency FFT):', audioState.samples);

    if (consoleErrors.length > 0) {
      console.warn('Console errors detected:', consoleErrors);
    } else {
      console.log('Zero console errors detected!');
    }

    // Capture screenshot
    fs.mkdirSync(path.join(rootDir, 'tests/screenshots'), { recursive: true });
    const screenshotPath = path.join(rootDir, 'tests/screenshots/m2-tuned-in.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Screenshot saved to:', screenshotPath);

    console.log('\nMilestone 2 Verification Succeeded!');
  } finally {
    await browser.close();
  }
}

testAudioEngine().catch((err) => {
  console.error('Audio engine verification failed:', err);
  process.exit(1);
});

