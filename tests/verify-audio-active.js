import { chromium } from '@playwright/test';

async function testActiveSpectrum() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:3000/?demo', { waitUntil: 'networkidle' });

  // Fast-forward demo state to jog mode (25 seconds in) or zoomies (45 seconds in)
  await page.evaluate(async () => {
    const { state, updateUI } = await import('/src/main.js');
    const { getDemoStatus } = await import('/src/api.js');
    const { audioEngine } = await import('/src/music/engine.js');

    await audioEngine.start();

    // Trigger zoomies mode status (80 RPM)
    const zoomiesStatus = getDemoStatus(45000);
    state.status = zoomiesStatus;
    updateUI(zoomiesStatus);
  });

  await page.waitForTimeout(1000); // Wait 1 second for notes to schedule and play

  // Sample the analyser FFT while zoomies is playing (kick + lead + hat)
  const analysis = await page.evaluate(async () => {
    const { audioEngine } = await import('/src/music/engine.js');
    const analyser = audioEngine.analyser;
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const timeData = new Uint8Array(analyser.frequencyBinCount);

    const measurements = [];
    for (let i = 0; i < 5; i++) {
      analyser.getByteFrequencyData(freqData);
      analyser.getByteTimeDomainData(timeData);

      let peakFreq = 0;
      for (let j = 0; j < freqData.length; j++) {
        if (freqData[j] > peakFreq) peakFreq = freqData[j];
      }

      measurements.push({ peakFreq, centerWaveform: timeData[0] });
      await new Promise((r) => setTimeout(r, 150));
    }

    return {
      measurements,
      contextState: audioEngine.ctx.state,
      isPlaying: audioEngine.isPlaying,
    };
  });

  console.log('--- Zoomies Active Mode Audio Measurement ---');
  console.log('Context State:', analysis.contextState);
  console.log('Is Playing:', analysis.isPlaying);
  console.log('Audio Frequency Peaks (0-255):', analysis.measurements);

  await browser.close();
}

testActiveSpectrum().catch((e) => {
  console.error(e);
  process.exit(1);
});

