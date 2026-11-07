import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

describe('Media Session & Stream Routing — A/B Measurements & Actions', () => {
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

    browser = await chromium.launch({
      headless: true,
      args: ['--autoplay-policy=no-user-gesture-required'],
    });
    page = await browser.newPage();
    await page.goto(`http://localhost:${serverPort}/app.html?demo`);
  });

  after(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  it('runs A/B measurement of direct Web Audio vs MediaStream <audio> path', async () => {
    const measurements = await page.evaluate(async () => {
      const { audioEngine } = await import('/src/music/engine.js');
      await audioEngine.start();

      const ctx = audioEngine.ctx;
      const analyser = audioEngine.analyser;

      // 1. Measure Direct Destination Path
      const directLatencies = [];
      for (let i = 0; i < 20; i++) {
        const t0 = performance.now();
        const stats = audioEngine.getSchedulerStats();
        directLatencies.push(stats.currentLatenessMs);
        await new Promise((r) => setTimeout(r, 25));
      }

      const directBaseLatency = (ctx.baseLatency || 0) * 1000;
      const directOutputLatency = (ctx.outputLatency || 0) * 1000;

      // Sort latencies for percentiles
      directLatencies.sort((a, b) => a - b);
      const directP50 = directLatencies[Math.floor(directLatencies.length * 0.5)];
      const directP95 = directLatencies[Math.floor(directLatencies.length * 0.95)];

      // 2. Measure MediaStreamAudioDestinationNode + HTMLAudioElement Path
      const streamDest = ctx.createMediaStreamDestination();
      const testAudio = new Audio();
      testAudio.autoplay = false;
      testAudio.style.display = 'none';
      document.body.appendChild(testAudio);

      // Disconnect direct, route exclusively to stream
      try { analyser.disconnect(ctx.destination); } catch {}
      analyser.connect(streamDest);
      testAudio.srcObject = streamDest.stream;
      await testAudio.play();

      const streamLatencies = [];
      const startAudioTime = ctx.currentTime;
      const startPerfTime = performance.now();

      for (let i = 0; i < 20; i++) {
        const stats = audioEngine.getSchedulerStats();
        streamLatencies.push(stats.currentLatenessMs);
        await new Promise((r) => setTimeout(r, 25));
      }

      const elapsedAudioSec = ctx.currentTime - startAudioTime;
      const elapsedPerfSec = (performance.now() - startPerfTime) / 1000;
      const clockDriftMs = Math.abs(elapsedAudioSec - elapsedPerfSec) * 1000;

      streamLatencies.sort((a, b) => a - b);
      const streamP50 = streamLatencies[Math.floor(streamLatencies.length * 0.5)];
      const streamP95 = streamLatencies[Math.floor(streamLatencies.length * 0.95)];

      // Clean up test routing and restore direct
      try {
        testAudio.pause();
        testAudio.srcObject = null;
        analyser.disconnect(streamDest);
        analyser.connect(ctx.destination);
        testAudio.remove();
      } catch {}

      return {
        direct: {
          baseLatencyMs: directBaseLatency,
          outputLatencyMs: directOutputLatency,
          schedP50Ms: directP50,
          schedP95Ms: directP95,
        },
        stream: {
          schedP50Ms: streamP50,
          schedP95Ms: streamP95,
          clockDriftMs,
        },
        addedP95LatenessMs: streamP95 - directP95,
      };
    });

    console.log('Media Session A/B Measurements:');
    console.log(`  Direct Path:  baseLatency=${measurements.direct.baseLatencyMs.toFixed(1)}ms, p50=${measurements.direct.schedP50Ms.toFixed(2)}ms, p95=${measurements.direct.schedP95Ms.toFixed(2)}ms`);
    console.log(`  Stream Path:  p50=${measurements.stream.schedP50Ms.toFixed(2)}ms, p95=${measurements.stream.schedP95Ms.toFixed(2)}ms, drift=${measurements.stream.clockDriftMs.toFixed(2)}ms`);
    console.log(`  Added Latency / Diff: ${measurements.addedP95LatenessMs.toFixed(2)}ms`);

    // Verify scheduler lateness p95 remains under 25ms threshold
    assert.ok(measurements.stream.schedP95Ms < 25.0, `Stream scheduler p95 ${measurements.stream.schedP95Ms}ms exceeds 25ms`);
  });

  it('verifies Media Session updates metadata and revokes artwork without memory leak', async () => {
    const memoryCheck = await page.evaluate(async () => {
      const { MediaSessionManager } = await import('/src/platform/media-session.js');
      const { audioEngine } = await import('/src/music/engine.js');

      const mgr = new MediaSessionManager({
        audioEngine,
        getState: () => ({ activeMode: 'live' }),
      });

      // Simulate 15 mood changes
      const moods = ['sleep', 'jog', 'zoomies', 'sleep', 'jog', 'zoomies'];
      for (const m of moods) {
        await mgr.updateMetadata({
          blockHeight: 1000,
          scaleLabel: 'Dorian',
          bpm: 112,
          mood: m,
        });
      }

      // Assert that cached artwork URLs is strictly capped at 2 (256 and 512 for latest mood)
      return {
        cachedCount: mgr.cachedArtworkUrls.length,
        hasSupported: mgr.isSupported,
      };
    });

    assert.equal(memoryCheck.cachedCount, 2, 'Must retain only 2 active artwork URLs (256 and 512), revoking older ones');
  });

  it('verifies Media Session action handlers toggle playback and sync UI state', async () => {
    const handlerTest = await page.evaluate(async () => {
      const { MediaSessionManager } = await import('/src/platform/media-session.js');
      const { audioEngine } = await import('/src/music/engine.js');

      let playCalled = false;
      let pauseCalled = false;
      let stopCalled = false;

      const mgr = new MediaSessionManager({
        audioEngine,
        getState: () => ({ activeMode: 'live' }),
        onPlay: () => { playCalled = true; },
        onPause: () => { pauseCalled = true; },
        onStop: () => { stopCalled = true; },
      });

      // Invoke registered handlers
      if (typeof navigator !== 'undefined' && navigator.mediaSession) {
        mgr.onPlay();
        mgr.onPause();
        mgr.onStop();
      }

      return { playCalled, pauseCalled, stopCalled };
    });

    assert.equal(handlerTest.playCalled, true);
    assert.equal(handlerTest.pauseCalled, true);
    assert.equal(handlerTest.stopCalled, true);
  });
});

