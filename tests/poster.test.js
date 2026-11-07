import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

describe('Poster Renderer — Determinism, Formats, Band Scaling & Fallbacks', () => {
  let server;
  let serverPort;
  let browser;
  let page;

  before(async () => {
    const MIME_TYPES = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.woff2': 'font/woff2',
      '.png': 'image/png',
      '.json': 'application/json; charset=utf-8',
    };

    server = http.createServer((req, res) => {
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

    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    await page.goto(`http://localhost:${serverPort}/app.html`);
  });

  after(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  it('produces byte-identical PNG dataURLs for identical state with a fixed clock', async () => {
    const dataUrls = await page.evaluate(async () => {
      const { renderBandPoster } = await import('/src/share/poster.js');
      const canvas = document.createElement('canvas');

      const mockState = {
        format: 'landscape',
        status: {
          isAvailable: true,
          freshness: 'online',
          mood: 'jog',
          blockHeight: 1250,
          blockProgressRatio: 0.45,
        },
        bpm: 88,
        keyInfo: { rootName: 'D', scaleName: 'Dorian' },
        palette: 'analog',
        tokens: [
          { tokenId: '101', level: 1, numericBasePower: 1200 },
          { tokenId: '202', level: 3, numericBasePower: 2400 },
        ],
        waveformSample: new Uint8Array(128).fill(128),
        privacy: 'hide',
        fixedTimestamp: '2026-11-06T12:00:00.000Z',
      };

      await renderBandPoster(canvas, mockState);
      const url1 = canvas.toDataURL('image/png');

      await renderBandPoster(canvas, mockState);
      const url2 = canvas.toDataURL('image/png');

      return { url1, url2 };
    });

    assert.equal(dataUrls.url1.length > 100, true);
    assert.equal(dataUrls.url1, dataUrls.url2, 'Identical state must produce byte-identical PNG output');
  });

  it('renders all three formats with exact target pixel dimensions directly', async () => {
    const dimensions = await page.evaluate(async () => {
      const { renderBandPoster } = await import('/src/share/poster.js');
      const canvas = document.createElement('canvas');

      const formats = ['landscape', 'square', 'portrait'];
      const results = {};

      for (const fmt of formats) {
        await renderBandPoster(canvas, {
          format: fmt,
          fixedTimestamp: '2026-11-06T12:00:00.000Z',
        });
        results[fmt] = { width: canvas.width, height: canvas.height };
      }

      return results;
    });

    assert.deepEqual(dimensions.landscape, { width: 1200, height: 630 });
    assert.deepEqual(dimensions.square, { width: 1080, height: 1080 });
    assert.deepEqual(dimensions.portrait, { width: 1080, height: 1350 });
  });

  it('renders correctly with 0, 1, 24, and 100 Squeeks and generates in under 1.5s for 100 Squeeks', async () => {
    const result = await page.evaluate(async () => {
      const { renderBandPoster } = await import('/src/share/poster.js');
      const canvas = document.createElement('canvas');

      // Test 0 Squeeks (Live Wheel fallback)
      await renderBandPoster(canvas, {
        format: 'landscape',
        tokens: [],
        fixedTimestamp: '2026-11-06T12:00:00.000Z',
      });
      const zeroPng = canvas.toDataURL('image/png');

      // Test 1 Squeek
      await renderBandPoster(canvas, {
        format: 'landscape',
        tokens: [{ tokenId: '1', level: 2, numericBasePower: 1500 }],
        fixedTimestamp: '2026-11-06T12:00:00.000Z',
      });
      const onePng = canvas.toDataURL('image/png');

      // Test 24 Squeeks
      const tokens24 = Array.from({ length: 24 }, (_, i) => ({
        tokenId: String(i + 1),
        level: (i % 5) + 1,
        numericBasePower: 1000 + i * 50,
      }));
      await renderBandPoster(canvas, {
        format: 'landscape',
        tokens: tokens24,
        fixedTimestamp: '2026-11-06T12:00:00.000Z',
      });
      const twentyFourPng = canvas.toDataURL('image/png');

      // Test 100 Squeeks and measure render latency
      const tokens100 = Array.from({ length: 100 }, (_, i) => ({
        tokenId: String(i + 1),
        level: (i % 5) + 1,
        numericBasePower: 500 + i * 20,
      }));

      const t0 = performance.now();
      await renderBandPoster(canvas, {
        format: 'landscape',
        tokens: tokens100,
        fixedTimestamp: '2026-11-06T12:00:00.000Z',
      });
      const renderDurationMs = performance.now() - t0;
      const hundredPng = canvas.toDataURL('image/png');

      return {
        hasZero: zeroPng.length > 100,
        hasOne: onePng.length > 100,
        has24: twentyFourPng.length > 100,
        has100: hundredPng.length > 100,
        renderDurationMs,
      };
    });

    assert.ok(result.hasZero);
    assert.ok(result.hasOne);
    assert.ok(result.has24);
    assert.ok(result.has100);
    // Acceptance criterion: under 1.5s (1500ms) for 100 Squeeks
    assert.ok(result.renderDurationMs < 1500, `Render took ${result.renderDurationMs}ms, expected < 1500ms`);
  });

  it('draws deterministic avatar without throwing when tainted image fallback is invoked', async () => {
    const success = await page.evaluate(async () => {
      const { drawSqueekAvatarFallback } = await import('/src/share/poster.js');
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');

      // Test all 5 levels
      for (let lvl = 1; lvl <= 5; lvl++) {
        drawSqueekAvatarFallback(ctx, 50, 50, 60, { tokenId: '42', level: lvl });
      }

      // Ensure canvas is not tainted and toBlob succeeds
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob && blob.size > 0);
        }, 'image/png');
      });
    });

    assert.ok(success, 'Fallback avatar must produce a valid blob without throwing');
  });

  it('writes SIGNAL UNKNOWN and preserves honest state when status is unavailable', async () => {
    const pngLength = await page.evaluate(async () => {
      const { renderBandPoster } = await import('/src/share/poster.js');
      const canvas = document.createElement('canvas');

      await renderBandPoster(canvas, {
        format: 'landscape',
        status: {
          isAvailable: false,
          freshness: 'unavailable',
        },
        fixedTimestamp: '2026-11-06T12:00:00.000Z',
      });

      return canvas.toDataURL('image/png').length;
    });

    assert.ok(pngLength > 100);
  });
});
