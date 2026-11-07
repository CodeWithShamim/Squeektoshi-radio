import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outputPath = path.join(rootDir, 'card.png');

async function generateCard() {
  console.log('Rendering 1200x630 compliant social card with Playwright & renderBandPoster...');

  const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
    '.json': 'application/json; charset=utf-8',
  };

  let serverPort;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${serverPort}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/app.html';
    const filePath = path.join(rootDir, pathname);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(data);
    });
  });

  await new Promise((resolve) => {
    server.listen(0, () => {
      serverPort = server.address().port;
      resolve();
    });
  });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });

  await page.goto(`http://localhost:${serverPort}/app.html`);

  await page.evaluate(async () => {
    const { renderBandPoster } = await import('/src/share/poster.js');
    const canvas = document.createElement('canvas');
    canvas.id = 'og-card-canvas';
    canvas.style.display = 'block';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.width = 1200;
    canvas.height = 630;
    document.body.appendChild(canvas);

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

    const waveform = new Uint8Array(128);
    for (let i = 0; i < 128; i++) {
      waveform[i] = 128 + Math.round(Math.sin(i * 0.18) * 35 * Math.sin(i * 0.05));
    }

    await renderBandPoster(canvas, {
      format: 'landscape',
      status: {
        isAvailable: true,
        freshness: 'online',
        mood: 'jog',
        blockHeight: 2366,
        blockProgressRatio: 0.62,
      },
      bpm: 112,
      keyInfo: { rootName: 'D', scaleName: 'Dorian' },
      palette: 'analog',
      tokens: demoTokens,
      waveformSample: waveform,
      privacy: 'hide',
      siteUrl: 'squeektoshi.radio',
      fixedTimestamp: '2026-11-06T14:00:00.000Z',
    });
  });

  const canvasEl = page.locator('#og-card-canvas');
  await canvasEl.screenshot({ path: outputPath });

  await page.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));

  console.log(`✓ Card successfully saved to ${outputPath}`);
}

generateCard().catch((err) => {
  console.error('Failed to generate card:', err);
  process.exit(1);
});
