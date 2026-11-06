import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outputPath = path.join(rootDir, 'card.png');

async function generateCard() {
  console.log('Rendering 1200x630 social card with Playwright...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 1200px;
      height: 630px;
      background-color: #121217;
      background-image: radial-gradient(#2e2e3d 1.5px, transparent 1.5px);
      background-size: 28px 28px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #f0f0f5;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 60px 70px;
      position: relative;
      overflow: hidden;
    }
    .glow-bg {
      position: absolute;
      top: -100px;
      right: -100px;
      width: 500px;
      height: 500px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(242, 184, 75, 0.15) 0%, rgba(91, 140, 255, 0.08) 50%, transparent 70%);
      filter: blur(60px);
      pointer-events: none;
    }
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 2;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 18px;
    }
    .brand-icon {
      width: 64px;
      height: 64px;
      border-radius: 18px;
      background: linear-gradient(135deg, #f2b84b, #df9b20);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 36px;
      box-shadow: 0 0 25px rgba(242, 184, 75, 0.4);
    }
    .brand-name {
      font-size: 38px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .brand-name span { color: #f2b84b; }
    .badge {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #1e1e28;
      border: 1px solid #2e2e3d;
      padding: 10px 20px;
      border-radius: 9999px;
      font-family: ui-monospace, monospace;
      font-size: 16px;
      color: #9e9eb4;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #34d399;
      box-shadow: 0 0 10px #34d399;
    }
    .hero {
      z-index: 2;
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 900px;
    }
    .hero-title {
      font-size: 54px;
      font-weight: 800;
      line-height: 1.15;
      letter-spacing: -0.03em;
    }
    .hero-title .gradient-text {
      background: linear-gradient(135deg, #f2b84b 0%, #5b8cff 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .hero-desc {
      font-size: 22px;
      color: #9e9eb4;
      line-height: 1.45;
    }
    .features-strip {
      display: flex;
      gap: 20px;
      z-index: 2;
    }
    .feature-card {
      background: rgba(26, 26, 36, 0.9);
      border: 1px solid #2e2e3d;
      border-radius: 14px;
      padding: 14px 22px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .feature-label {
      font-size: 13px;
      text-transform: uppercase;
      color: #6a6a80;
      font-family: ui-monospace, monospace;
      font-weight: 700;
    }
    .feature-val {
      font-size: 18px;
      font-weight: 700;
      color: #f2b84b;
    }
  </style>
</head>
<body>
  <div class="glow-bg"></div>

  <div class="top-bar">
    <div class="brand">
      <div class="brand-icon">🐹</div>
      <div class="brand-name">Squeektoshi <span>Radio</span></div>
    </div>
    <div class="badge">
      <div class="dot"></div>
      <span>Hamster PoW Live Station</span>
    </div>
  </div>

  <div class="hero">
    <h1 class="hero-title">
      Turn Live Hamster Telemetry into a <span class="gradient-text">Generative Music Station</span>
    </h1>
    <p class="hero-desc">
      A continuous stream companion running 100% in the browser. Wheel RPM sets the tempo, completed blocks advance the chords, and your Squeek NFTs join the band.
    </p>
  </div>

  <div class="features-strip">
    <div class="feature-card">
      <div class="feature-label">Sound Synthesis</div>
      <div class="feature-val">100% Web Audio API</div>
    </div>
    <div class="feature-card">
      <div class="feature-label">Shared Listening</div>
      <div class="feature-val">Serverless Sync (PRNG)</div>
    </div>
    <div class="feature-card">
      <div class="feature-label">NFT Integration</div>
      <div class="feature-val">Squeeks as Band Voices</div>
    </div>
    <div class="feature-card">
      <div class="feature-label">Streamers</div>
      <div class="feature-val">OBS Browser Overlay</div>
    </div>
  </div>
</body>
</html>
  `;

  await page.setContent(html);
  await page.screenshot({ path: outputPath });
  console.log('Saved social card (1200x630) to:', outputPath);

  await browser.close();
}

generateCard().catch((err) => {
  console.error('Card generation failed:', err);
  process.exit(1);
});

