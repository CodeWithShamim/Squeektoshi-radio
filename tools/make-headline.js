import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outputPath = path.join(rootDir, 'assets', 'headline-banner.png');
const artPath = path.join(rootDir, 'assets', 'headline-art.png');

async function generateHeadlineBanner() {
  console.log('Rendering branded headline banner with Playwright...');
  
  // Read art image as base64
  const artBase64 = fs.existsSync(artPath) 
    ? `data:image/png;base64,${fs.readFileSync(artPath).toString('base64')}`
    : '';

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 600 } });

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    @font-face {
      font-family: 'Cinzel';
      font-style: normal;
      font-weight: 700;
      src: url('file://${rootDir}/assets/fonts/cinzel.woff2') format('woff2');
    }
    @font-face {
      font-family: 'IBM Plex Mono';
      font-style: normal;
      font-weight: 400;
      src: url('file://${rootDir}/assets/fonts/ibm-plex-mono-regular.woff2') format('woff2');
    }
    @font-face {
      font-family: 'IBM Plex Mono';
      font-style: normal;
      font-weight: 600;
      src: url('file://${rootDir}/assets/fonts/ibm-plex-mono-semibold.woff2') format('woff2');
    }

    body {
      width: 1400px;
      height: 600px;
      background-color: #0b0b0e;
      color: #e9e6dc;
      font-family: 'IBM Plex Mono', monospace;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 44px 56px;
    }

    /* Background Art with Vignette */
    .bg-art {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-image: url('${artBase64}');
      background-size: cover;
      background-position: center right;
      opacity: 0.88;
      z-index: 1;
    }
    .bg-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(
        90deg, 
        rgba(11, 11, 14, 0.96) 0%, 
        rgba(11, 11, 14, 0.88) 42%, 
        rgba(11, 11, 14, 0.45) 75%, 
        rgba(11, 11, 14, 0.25) 100%
      );
      z-index: 2;
    }
    .bg-vignette {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      box-shadow: inset 0 0 120px rgba(11, 11, 14, 0.95);
      border: 1px solid rgba(233, 230, 220, 0.12);
      z-index: 3;
      pointer-events: none;
    }

    /* Technical grid lines */
    .hairline-grid {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-image: linear-gradient(to right, rgba(233, 230, 220, 0.04) 1px, transparent 1px);
      background-size: calc(100% / 12) 100%;
      z-index: 2;
      pointer-events: none;
    }

    /* Corner Datum Crosses */
    .cross {
      position: absolute;
      font-family: monospace;
      font-size: 14px;
      color: rgba(233, 230, 220, 0.4);
      z-index: 4;
    }
    .cross-tl { top: 16px; left: 20px; }
    .cross-tr { top: 16px; right: 20px; }
    .cross-bl { bottom: 16px; left: 20px; }
    .cross-br { bottom: 16px; right: 20px; }

    /* Top HUD */
    .top-bar {
      z-index: 5;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .station-id {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 12px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(233, 230, 220, 0.6);
    }
    .dot-live {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ffb23e;
      box-shadow: 0 0 12px #ffb23e;
    }
    .hud-pills {
      display: flex;
      gap: 12px;
    }
    .hud-pill {
      background: rgba(26, 26, 36, 0.75);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(233, 230, 220, 0.15);
      border-radius: 9999px;
      padding: 6px 14px;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(233, 230, 220, 0.75);
    }
    .hud-pill.highlight {
      border-color: rgba(255, 178, 62, 0.4);
      color: #ffb23e;
    }

    /* Center Content */
    .center-content {
      z-index: 5;
      max-width: 780px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .eyebrow {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      color: #ffb23e;
      font-weight: 600;
    }
    .eyebrow::before {
      content: "";
      width: 24px;
      height: 1px;
      background: #ffb23e;
    }
    .main-title {
      font-family: 'Cinzel', Georgia, serif;
      font-size: 58px;
      font-weight: 700;
      line-height: 1.05;
      letter-spacing: -0.01em;
      color: #e9e6dc;
    }
    .main-title span {
      color: #ffb23e;
      text-shadow: 0 0 35px rgba(255, 178, 62, 0.35);
    }
    .tagline {
      font-size: 19px;
      line-height: 1.5;
      color: rgba(233, 230, 220, 0.75);
      font-weight: 400;
      max-width: 680px;
    }

    /* Bottom Status Strip */
    .bottom-bar {
      z-index: 5;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding-top: 18px;
      border-top: 1px solid rgba(233, 230, 220, 0.1);
    }
    .telemetry-badges {
      display: flex;
      gap: 28px;
    }
    .t-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .t-label {
      font-size: 10px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(233, 230, 220, 0.45);
    }
    .t-val {
      font-size: 14px;
      font-weight: 600;
      color: #e9e6dc;
    }
    .t-val.amber { color: #ffb23e; }
    .t-val.blue { color: #5b8cff; }

    .brand-stamp {
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: rgba(233, 230, 220, 0.4);
    }
  </style>
</head>
<body>
  <div class="bg-art"></div>
  <div class="bg-overlay"></div>
  <div class="hairline-grid"></div>
  <div class="bg-vignette"></div>

  <span class="cross cross-tl">+</span>
  <span class="cross cross-tr">+</span>
  <span class="cross cross-bl">+</span>
  <span class="cross cross-br">+</span>

  <div class="top-bar">
    <div class="station-id">
      <div class="dot-live"></div>
      <span>WHEELY9000 OBSERVATORY // LIVE POW STREAM</span>
    </div>
    <div class="hud-pills">
      <div class="hud-pill highlight">Genesis Code Lane</div>
      <div class="hud-pill">100% Web Audio</div>
      <div class="hud-pill">Zero Server Sync</div>
    </div>
  </div>

  <div class="center-content">
    <div class="eyebrow">Squeekchain Telemetry Audio Engine</div>
    <h1 class="main-title">Squeektoshi <span>Radio</span></h1>
    <p class="tagline">A hamster runs. The chain counts. You hear it. Continuous generative soundscapes synthesized directly from physical proof-of-work.</p>
  </div>

  <div class="bottom-bar">
    <div class="telemetry-badges">
      <div class="t-item">
        <span class="t-label">Telemetry Source</span>
        <span class="t-val amber">WHEELY9000 Sensor Gate</span>
      </div>
      <div class="t-item">
        <span class="t-label">Tempo Control</span>
        <span class="t-val">Wheel RPM &rarr; 48–160 BPM</span>
      </div>
      <div class="t-item">
        <span class="t-label">NFT Voice Band</span>
        <span class="t-val blue">Public Wallet Synthesizer</span>
      </div>
      <div class="t-item">
        <span class="t-label">Stream Mode</span>
        <span class="t-val">OBS Alpha Overlay</span>
      </div>
    </div>
    <div class="brand-stamp">
      squeekchain.com // Sepolia testnet
    </div>
  </div>
</body>
</html>
  `;

  await page.setContent(html);
  // Wait for fonts to load
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: outputPath });
  console.log('Saved headline banner (1400x600) to:', outputPath);

  await browser.close();
}

generateHeadlineBanner().catch((err) => {
  console.error('Headline generation failed:', err);
  process.exit(1);
});

