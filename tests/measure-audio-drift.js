import { chromium } from '@playwright/test';

async function measureAudioSchedulerDrift() {
  console.log('--- Measuring Audio Scheduler Look-ahead Lateness & Visuals Load ---');
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();

  await page.goto('http://localhost:3000/app.html?demo');
  await page.waitForTimeout(1000);

  // Click Tune In
  await page.locator('#tune-btn').click();
  await page.waitForTimeout(500);

  // Inject scheduler instrumentor and frame-time recorder
  const metrics = await page.evaluate(async () => {
    const { audioEngine } = await import('/src/music/engine.js');
    const ctx = audioEngine.ctx;
    const scheduler = audioEngine.scheduler;

    let maxLatenessWithVisuals = 0;
    let latenessSamplesWithVisuals = [];
    let frameTimesWithVisuals = [];
    let lastFrameTime = performance.now();

    // Hook into scheduleStep to measure if scheduled time is behind currentTime
    const originalScheduleStep = scheduler.scheduleStep.bind(scheduler);
    scheduler.scheduleStep = function (time, step) {
      const lateness = Math.max(0, (ctx.currentTime - time) * 1000);
      latenessSamplesWithVisuals.push(lateness);
      if (lateness > maxLatenessWithVisuals) maxLatenessWithVisuals = lateness;
      return originalScheduleStep(time, step);
    };

    // Record frame times for 3 seconds with visuals
    const recordFrames = (now) => {
      frameTimesWithVisuals.push(now - lastFrameTime);
      lastFrameTime = now;
      if (running) requestAnimationFrame(recordFrames);
    };
    let running = true;
    requestAnimationFrame(recordFrames);

    await new Promise((r) => setTimeout(r, 3000));
    running = false;

    // Now test with visuals paused/hidden
    const dialSvg = document.getElementById('dial-svg');
    const waveformCanvas = document.getElementById('dial-waveform-canvas');
    if (dialSvg) dialSvg.style.display = 'none';
    if (waveformCanvas) waveformCanvas.style.display = 'none';

    let maxLatenessWithoutVisuals = 0;
    let latenessSamplesWithoutVisuals = [];
    scheduler.scheduleStep = function (time, step) {
      const lateness = Math.max(0, (ctx.currentTime - time) * 1000);
      latenessSamplesWithoutVisuals.push(lateness);
      if (lateness > maxLatenessWithoutVisuals) maxLatenessWithoutVisuals = lateness;
      return originalScheduleStep(time, step);
    };

    await new Promise((r) => setTimeout(r, 2000));

    // Restore
    if (dialSvg) dialSvg.style.display = '';
    if (waveformCanvas) waveformCanvas.style.display = '';

    const avgFrameTime =
      frameTimesWithVisuals.reduce((a, b) => a + b, 0) / (frameTimesWithVisuals.length || 1);
    const fps = Math.round(1000 / avgFrameTime);

    return {
      fps,
      avgFrameTimeMs: avgFrameTime.toFixed(2),
      maxLatenessWithVisualsMs: maxLatenessWithVisuals.toFixed(2),
      avgLatenessWithVisualsMs: (
        latenessSamplesWithVisuals.reduce((a, b) => a + b, 0) /
        (latenessSamplesWithVisuals.length || 1)
      ).toFixed(2),
      maxLatenessWithoutVisualsMs: maxLatenessWithoutVisuals.toFixed(2),
      avgLatenessWithoutVisualsMs: (
        latenessSamplesWithoutVisuals.reduce((a, b) => a + b, 0) /
        (latenessSamplesWithoutVisuals.length || 1)
      ).toFixed(2),
      sampleCountWithVisuals: latenessSamplesWithVisuals.length,
      sampleCountWithoutVisuals: latenessSamplesWithoutVisuals.length,
    };
  });

  await browser.close();

  console.log('\n=== Audio Scheduler Benchmark Results ===');
  console.log(`Frame Rate: ${metrics.fps} FPS (avg frame time: ${metrics.avgFrameTimeMs} ms)`);
  console.log(`With Visuals (SVG Dial + Canvas Waveform):`);
  console.log(`  Max look-ahead lateness: ${metrics.maxLatenessWithVisualsMs} ms (Target < 25 ms)`);
  console.log(`  Avg look-ahead lateness: ${metrics.avgLatenessWithVisualsMs} ms`);
  console.log(`  Steps scheduled: ${metrics.sampleCountWithVisuals}`);
  console.log(`Without Visuals:`);
  console.log(`  Max look-ahead lateness: ${metrics.maxLatenessWithoutVisualsMs} ms`);
  console.log(`  Avg look-ahead lateness: ${metrics.avgLatenessWithoutVisualsMs} ms`);
  console.log(`  Steps scheduled: ${metrics.sampleCountWithoutVisuals}`);

  const passed = parseFloat(metrics.maxLatenessWithVisualsMs) < 25;
  console.log(`\nVerification: ${passed ? 'PASSED (lateness < 25 ms)' : 'FAILED'}`);
  if (!passed) process.exit(1);
}

measureAudioSchedulerDrift().catch((err) => {
  console.error(err);
  process.exit(1);
});

