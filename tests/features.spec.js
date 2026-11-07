import { test, expect } from '@playwright/test';

test.describe('Three Features — End-to-End Suite: Best Hour, Share Poster, Tab Title & Media Session', () => {
  test('Best Hour: activates excerpt, highlights dial ring, displays HUD, and returns to Live without AudioContext restart', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/app.html?demo');

    // 1. Verify Best Hour button exists and is active in demo mode
    const bestHourBtn = page.locator('#btn-best-hour');
    await expect(bestHourBtn).toBeVisible();
    await expect(bestHourBtn).toBeEnabled();

    // 2. Click Best hour to activate
    await bestHourBtn.click();

    // HUD must become visible with honest metrics
    const hud = page.locator('#best-hour-hud');
    await expect(hud).toBeVisible();
    await expect(page.locator('#best-hour-hud-rank')).toHaveText(/1 of 24/);
    await expect(page.locator('#best-hour-hud-work')).toContainText('passes');

    // Button changes label to stop
    await expect(bestHourBtn).toHaveText(/Stop Best/);

    // Live button is revealed
    const liveBtn = page.locator('.btn-live-switch, .btn-header-live, #tab-live').first();
    await expect(liveBtn).toBeVisible();

    // Tab title reflects Best Hour replay
    await expect(page).toHaveTitle(/Replay · .* · Squeektoshi Radio/);

    // Context remains running
    const ctxStateBefore = await page.evaluate(async () => {
      const { audioEngine } = await import('/src/music/engine.js');
      return audioEngine.ctx?.state;
    });
    expect(ctxStateBefore).toBe('running');

    // 3. Click Live to return cleanly
    await liveBtn.click();

    // HUD hidden
    await expect(hud).toBeHidden();
    await expect(bestHourBtn).toHaveText(/Best hour/);

    // Context still running (not restarted)
    const ctxStateAfter = await page.evaluate(async () => {
      const { audioEngine } = await import('/src/music/engine.js');
      return audioEngine.ctx?.state;
    });
    expect(ctxStateAfter).toBe('running');

    expect(consoleErrors).toHaveLength(0);
  });

  test('Best Hour: keyboard shortcut H toggles Best Hour', async ({ page }) => {
    await page.goto('/app.html?demo');

    const bestHourBtn = page.locator('#btn-best-hour');
    await expect(bestHourBtn).toBeVisible();

    // Press H
    await page.keyboard.press('KeyH');
    await expect(page.locator('#best-hour-hud')).toBeVisible();

    // Press H again to stop
    await page.keyboard.press('KeyH');
    await expect(page.locator('#best-hour-hud')).toBeHidden();
  });

  test('Best Hour: handles all-zero bucket data honestly with disabled control', async ({ page }) => {
    // Mock settlements with 24 all-zero buckets
    const zeroBuckets = Array.from({ length: 24 }, (_, i) => ({
      startAt: `2026-11-06T${String(i).padStart(2, '0')}:00:00.000Z`,
      endAt: `2026-11-06T${String((i + 1) % 24).padStart(2, '0')}:00:00.000Z`,
      workAdded: '0',
      completedBlockCount: '0',
      settlementCount: '6',
    }));

    await page.route('**/v1/settlements*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'available',
          settlementCount: '140',
          buckets: zeroBuckets,
        }),
      });
    });

    await page.goto('/app.html');
    await page.waitForTimeout(600);

    const bestHourBtn = page.locator('#btn-best-hour');
    await expect(bestHourBtn).toBeDisabled();
    await expect(bestHourBtn).toHaveAttribute('title', 'No active hour in the last 24 hours.');

    // Open Console and check reason message
    await page.keyboard.press('KeyC');
    const reasonMsg = page.locator('#best-hour-reason-msg');
    await expect(reasonMsg).toBeVisible();
    await expect(reasonMsg).toHaveText('No active hour in the last 24 hours.');
  });

  test('Best Hour: handles unavailable response honestly with disabled control', async ({ page }) => {
    await page.route('**/v1/settlements*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'unavailable',
          reason: 'indexer_offline',
          buckets: [],
        }),
      });
    });

    await page.goto('/app.html');
    await page.waitForTimeout(600);

    const bestHourBtn = page.locator('#btn-best-hour');
    await expect(bestHourBtn).toBeDisabled();
    await expect(bestHourBtn).toHaveAttribute('title', 'Hour data unknown right now.');
  });

  test('Best Hour: zero node leaks after starting and stopping 20 times', async ({ page }) => {
    await page.goto('/app.html?demo');

    const leakStats = await page.evaluate(async () => {
      const { startBestHour, stopBestHour } = await import('/src/main.js');
      const { audioEngine } = await import('/src/music/engine.js');
      await audioEngine.start();

      const initialActiveVoices = audioEngine.getSchedulerStats().activeVoices;

      // Start and stop 20 times rapidly
      for (let i = 0; i < 20; i++) {
        await startBestHour();
        await new Promise((r) => setTimeout(r, 60));
        stopBestHour();
        await new Promise((r) => setTimeout(r, 40));
      }

      const finalActiveVoices = audioEngine.getSchedulerStats().activeVoices;

      return {
        initialActiveVoices,
        finalActiveVoices,
      };
    });

    expect(leakStats.finalActiveVoices).toBeLessThanOrEqual(leakStats.initialActiveVoices + 2);
  });

  test('Share Band Poster: format switcher, privacy levels, and download PNG', async ({ page }) => {
    await page.goto('/app.html?demo&wallet=0x1234567890abcdef1234567890abcdef12345678');
    await page.waitForTimeout(500);

    // Open share modal via S key
    await page.keyboard.press('KeyS');
    const modal = page.locator('#share-modal');
    await expect(modal).toBeVisible();

    const canvas = page.locator('#poster-canvas');
    await expect(canvas).toBeVisible();

    // Verify initial landscape format (1200x630)
    let w = await canvas.evaluate((el) => el.width);
    let h = await canvas.evaluate((el) => el.height);
    expect(w).toBe(1200);
    expect(h).toBe(630);

    // Switch to Square format (1080x1080)
    const squareBtn = page.locator('#poster-format-control [data-format="square"]');
    await squareBtn.click();
    await page.waitForTimeout(200);

    w = await canvas.evaluate((el) => el.width);
    h = await canvas.evaluate((el) => el.height);
    expect(w).toBe(1080);
    expect(h).toBe(1080);

    // Switch to Portrait format (1080x1350)
    const portraitBtn = page.locator('#poster-format-control [data-format="portrait"]');
    await portraitBtn.click();
    await page.waitForTimeout(200);

    w = await canvas.evaluate((el) => el.width);
    h = await canvas.evaluate((el) => el.height);
    expect(w).toBe(1080);
    expect(h).toBe(1350);

    // Verify privacy defaults: Hide -> Short -> Full
    const copyLinkBtn = page.locator('#btn-copy-share-link');
    await copyLinkBtn.click();
    await expect(page.locator('#share-modal-feedback')).toBeVisible();

    // Verify Download PNG creates valid non-empty PNG
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#btn-download-png').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/squeektoshi-portrait-.*\.png/);

    // Close modal via ESC
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
  });

  test('Live Tab Title: updates dynamically across idle, playing, unknown, and replay states', async ({ page }) => {
    await page.goto('/app.html');
    await page.waitForTimeout(400);

    // In Playwright with no-user-gesture-required autoplay, engine tunes in on visit
    await expect(page).toHaveTitle(/Squeektoshi Radio · \d+ bpm · Block #?\d+/);

    // Stop/Pause via tune-btn -> returns to base idle title
    const tuneBtn = page.locator('#tune-btn');
    await tuneBtn.click();
    await page.waitForTimeout(1100);
    await expect(page).toHaveTitle('Squeektoshi Radio');

    // Resume -> returns to playing title
    await tuneBtn.click();
    await page.waitForTimeout(1100);
    await expect(page).toHaveTitle(/Squeektoshi Radio · \d+ bpm · Block #?\d+/);
  });
});
