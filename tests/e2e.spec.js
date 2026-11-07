import { test, expect } from '@playwright/test';

test.describe('Squeektoshi Radio - End-to-End Test Suite', () => {
  test('loads without console errors and starts AudioContext on Tune In', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/app.html?demo');

    // Page title and header
    await expect(page).toHaveTitle(/Squeektoshi Radio/);
    const headerTitle = page.locator('.brand-name');
    await expect(headerTitle).toContainText('Squeektoshi Radio');

    // Autoplay compliance: AudioContext should start only on user click
    const tuneBtn = page.locator('#tune-btn');
    await expect(tuneBtn).toHaveText(/Tune [iI]n/);

    await tuneBtn.click();
    await expect(tuneBtn).toHaveText(/(● On Air|Mute)/);

    // AudioContext state check
    const ctxState = await page.evaluate(async () => {
      const { audioEngine } = await import('/src/music/engine.js');
      return audioEngine.ctx ? audioEngine.ctx.state : null;
    });
    expect(ctxState).toBe('running');

    expect(consoleErrors).toHaveLength(0);
  });

  test('mood changes dynamically when mocked status flips from SPINNING to IDLE', async ({ page }) => {
    let currentMockStatus = {
      schemaVersion: 1,
      measurement: {
        freshness: 'online',
        coreStatus: 'SPINNING',
        rpmMilli: 75000,
        speedMmPerSecond: 1100,
        distanceMm: 50000,
      },
      builder: {
        status: 'available',
        anchor: { blockHeight: '1200', blockProgress: '250000000' },
      },
    };

    // Mock the /v1/status route
    await page.route('**/v1/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(currentMockStatus),
      });
    });

    await page.goto('/app.html');
    await page.waitForTimeout(1000);

    // Should be in zoomies mood (75 RPM)
    const moodBadge = page.locator('#badge-mood');
    await expect(moodBadge).toHaveText('ZOOMIES');
    const dialSvg = page.locator('#dial-svg');
    await expect(dialSvg).toHaveClass(/dial-mood-zoomies/);

    // Flip mocked status to IDLE (0 RPM)
    currentMockStatus = {
      schemaVersion: 1,
      measurement: {
        freshness: 'online',
        coreStatus: 'IDLE',
        rpmMilli: 0,
        speedMmPerSecond: 0,
        distanceMm: 50000,
      },
      builder: {
        status: 'available',
        anchor: { blockHeight: '1200', blockProgress: '250000000' },
      },
    };

    // Wait for next 2-second status poll
    await page.waitForTimeout(2500);

    // Should now flip to SLEEP mood
    await expect(moodBadge).toHaveText('SLEEP');
    await expect(dialSvg).toHaveClass(/dial-mood-sleep/);
  });

  test('unavailable status shows banner and preserves state as UNKNOWN (not sleep or zero)', async ({ page }) => {
    let isUnavailable = false;

    await page.route('**/v1/status', async (route) => {
      if (isUnavailable) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            schemaVersion: 1,
            status: 'unavailable',
            reason: 'indexer_unavailable',
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            schemaVersion: 1,
            measurement: {
              freshness: 'online',
              coreStatus: 'ACTIVE',
              rpmMilli: 45000,
            },
            builder: {
              status: 'available',
              anchor: { blockHeight: '1250', blockProgress: '500000000' },
            },
          }),
        });
      }
    });

    await page.goto('/app.html');
    await page.waitForTimeout(1000);

    const moodBadge = page.locator('#badge-mood');
    await expect(moodBadge).toHaveText('JOG');
    const blockVal = page.locator('#val-block-height');
    await expect(blockVal).toHaveText('#1250');

    // Now trigger unavailable status
    isUnavailable = true;
    await page.waitForTimeout(2500);

    // Status banner MUST be visible
    const banner = page.locator('#status-banner');
    await expect(banner).toBeVisible();
    await expect(page.locator('#signal-text')).toHaveText('unknown');

    // Mood MUST transition to UNKNOWN, NOT SLEEP!
    await expect(moodBadge).toHaveText('UNKNOWN');
    const dialSvg = page.locator('#dial-svg');
    await expect(dialSvg).toHaveClass(/dial-mood-unknown/);

    // Block height MUST be preserved from last known good state
    await expect(blockVal).toHaveText('#1250');
  });

  test('OBS stream overlay mode (?overlay=1) hides controls and shows overlay widget', async ({ page }) => {
    await page.goto('/app.html?overlay=1');

    await expect(page.locator('body')).toHaveClass(/overlay-mode/);
    await expect(page.locator('#overlay-container')).toBeVisible();
    await expect(page.locator('.app-bottom-bar')).toBeHidden();
    await expect(page.locator('#tune-btn')).toBeHidden();
  });

  test('reduced motion disables entry sequence and sweep line', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/app.html');

    // Entry sweep line should be removed / hidden immediately
    const sweepLine = page.locator('#entry-sweep-line');
    await expect(sweepLine).toHaveCount(0);

    // Readout wrappers should be immediately visible
    const moodBadge = page.locator('#badge-mood');
    await expect(moodBadge).toBeVisible();
  });
});

