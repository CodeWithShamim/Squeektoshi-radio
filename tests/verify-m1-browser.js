import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Simple static HTTP server
function createServer() {
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  };

  return http.createServer((req, res) => {
    let filePath = path.join(rootDir, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  });
}

async function run() {
  const server = createServer();
  await new Promise((resolve) => server.listen(3333, resolve));
  console.log('Static server listening on http://localhost:3333');

  fs.mkdirSync(path.join(rootDir, 'tests/screenshots'), { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    // 1. Desktop 1280px viewport against REAL API
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    console.log('Navigating to http://localhost:3333 ...');
    await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });

    // Wait for the status indicator to become live or for live block height
    await page.waitForSelector('#val-block-height');
    await page.waitForTimeout(3000); // Give 3s for API response to populate

    const blockHeight = await page.textContent('#val-block-height');
    const mood = await page.textContent('#badge-mood');
    const rpm = await page.textContent('#val-rpm');
    const signal = await page.textContent('#signal-text');
    const sqkMinted = await page.textContent('#val-sqk-minted');

    console.log('--- Real API Live Status Captured in Browser ---');
    console.log('Block Height:', blockHeight);
    console.log('Mood:', mood);
    console.log('RPM:', rpm);
    console.log('Signal:', signal);
    console.log('SQK Minted:', sqkMinted);

    const desktopScreenshot = path.join(rootDir, 'tests/screenshots/m1-live-browser-1280.png');
    await page.screenshot({ path: desktopScreenshot, fullPage: true });
    console.log('Saved screenshot:', desktopScreenshot);

    // 2. Mobile 360px viewport test
    const mobilePage = await browser.newPage({ viewport: { width: 360, height: 740 } });
    await mobilePage.goto('http://localhost:3333', { waitUntil: 'networkidle' });
    await mobilePage.waitForTimeout(2000);

    const mobileScreenshot = path.join(rootDir, 'tests/screenshots/m1-live-browser-360.png');
    await mobilePage.screenshot({ path: mobileScreenshot, fullPage: true });
    console.log('Saved mobile screenshot:', mobileScreenshot);

    console.log('\nMilestone 1 Browser Verification Succeeded!');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});

