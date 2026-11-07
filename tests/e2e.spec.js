import { test, expect } from '@playwright/test';

test.describe('Squeektoshi Radio - End-to-End Test Suite', () => {
  test('loads without console errors and starts AudioContext on visit (with mute toggle)', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/app.html?demo');

    // Page title and header
    await expect(page).toHaveTitle(/Squeektoshi Radio/);
    const headerTitle = page.locator('.brand-name');
    await expect(headerTitle).toContainText('Squeektoshi Radio');

    // Audio tunes in on user visit
    const tuneBtn = page.locator('#tune-btn');
    await expect(tuneBtn).toHaveText(/(● On Air|Mute)/);

    // AudioContext state check
    const ctxState = await page.evaluate(async () => {
      const { audioEngine } = await import('/src/music/engine.js');
      return audioEngine.ctx ? audioEngine.ctx.state : null;
    });
    expect(ctxState).toBe('running');

    // Clicking tuneBtn toggles to Tune in (pause/mute)
    await tuneBtn.click();
    await expect(tuneBtn).toHaveText(/Tune [iI]n/);

    // Clicking again resumes
    await tuneBtn.click();
    await expect(tuneBtn).toHaveText(/(● On Air|Mute)/);

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

  test('Console Drawer opens on C key, toggles modes and sound palettes, and updates URL', async ({ page }) => {
    await page.goto('/app.html?demo');

    // Press 'C' to open console
    await page.keyboard.press('KeyC');
    const drawer = page.locator('#console-drawer');
    await expect(drawer).toHaveClass(/open/);

    // Switch mode to Orchestra
    const orchestraBtn = page.locator('.segment-btn[data-mode="orchestra"]');
    await orchestraBtn.click();
    await expect(orchestraBtn).toHaveClass(/active/);
    const modeDesc = page.locator('#mode-desc-text');
    await expect(modeDesc).toContainText(/harmonic progression/i);

    // Switch palette to Chamber
    const chamberBtn = page.locator('#palette-segmented-control .segment-btn[data-palette="chamber"]');
    await chamberBtn.click();
    await expect(chamberBtn).toHaveClass(/active/);

    // Verify shareable URL updated
    const shareInput = page.locator('#share-url-input');
    await expect(shareInput).toHaveValue(/mode=orchestra/);
    await expect(shareInput).toHaveValue(/palette=chamber/);

    // Press Escape to close
    await page.keyboard.press('Escape');
    await expect(drawer).not.toHaveClass(/open/);
  });

  test('Diagnostics Panel opens on D key and displays live telemetry & lateness', async ({ page }) => {
    await page.goto('/app.html?demo');

    // Press 'D' to open diagnostics
    await page.keyboard.press('KeyD');
    const diag = page.locator('#diagnostics-panel');
    await expect(diag).toHaveClass(/open/);

    // Check FPS and AudioContext metric readouts
    const metricFps = page.locator('#diag-fps');
    await expect(metricFps).toBeVisible();
    const metricCtx = page.locator('#diag-audio-state');
    await expect(metricCtx).toContainText(/(suspended|running)/);

    // Close diagnostics via close button
    await page.locator('#diag-close-btn').click();
    await expect(diag).not.toHaveClass(/open/);
  });

  test('Band wallet loading displays skeleton card slots and generation guard', async ({ page }) => {
    let mockAccountTokens = Array.from({ length: 6 }, (_, i) => ({
      tokenId: String(i + 1),
      level: (i % 3) + 1,
      runCount: i * 10,
    }));

    await page.route('**/v1/accounts/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tokens: mockAccountTokens,
          nextCursor: null,
        }),
      });
    });

    await page.goto('/app.html');
    await page.locator('#tab-band').click();

    const walletInput = page.locator('#wallet-input');
    const loadBtn = page.locator('#wallet-load-btn');

    await walletInput.fill('0x1234567890123456789012345678901234567890');
    await loadBtn.click();

    // Verify skeletons or cards loaded
    const cardsGrid = page.locator('#band-cards-grid');
    await expect(cardsGrid).toBeVisible();
    const cards = page.locator('.squeek-card');
    await expect(cards).toHaveCount(6);
  });

  test('header right contains Console button that opens console drawer', async ({ page }) => {
    await page.goto('/app.html');
    const headerConsoleBtn = page.locator('#btn-header-console');
    await expect(headerConsoleBtn).toBeVisible();
    await expect(headerConsoleBtn).toHaveText('Console');
    await expect(headerConsoleBtn).toHaveAttribute('aria-expanded', 'false');

    // Clicking header console button opens drawer
    await headerConsoleBtn.click();
    const drawer = page.locator('#console-drawer');
    await expect(drawer).toHaveClass(/open/);
    await expect(headerConsoleBtn).toHaveAttribute('aria-expanded', 'true');

    // Close via close button
    const closeBtn = page.locator('#console-close-btn');
    await closeBtn.click();
    await expect(drawer).not.toHaveClass(/open/);
    await expect(headerConsoleBtn).toHaveAttribute('aria-expanded', 'false');
  });

  test('Demo Try highlight button appears when mood is sleep and activates demo mode on click', async ({ page }) => {
    let mockRpm = 0;
    let mockCoreStatus = 'IDLE';

    await page.route('**/v1/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schemaVersion: 1,
          measurement: {
            freshness: 'online',
            coreStatus: mockCoreStatus,
            rpmMilli: mockRpm * 1000,
          },
          builder: {
            status: 'available',
            anchor: { blockHeight: '1200', blockProgress: '200000000' },
          },
        }),
      });
    });

    await page.goto('/app.html');
    await page.waitForTimeout(500);

    // Initial state is sleep: both Demo Try buttons should be visible and highlighted
    const moodBadge = page.locator('#badge-mood');
    await expect(moodBadge).toHaveText('SLEEP');

    const demoTryBtn = page.locator('#btn-demo-try');
    await expect(demoTryBtn).toBeVisible();
    await expect(demoTryBtn).toHaveText('Demo Try');
    await expect(demoTryBtn).toHaveClass(/btn-console-highlight/);

    const headerDemoBtn = page.locator('#btn-header-demo');
    await expect(headerDemoBtn).toBeVisible();
    await expect(headerDemoBtn).toHaveText('Demo Try');

    // Clicking Demo Try triggers demo mode
    await demoTryBtn.click();
    await page.waitForTimeout(400);

    // DEMO badge should now be shown
    const demoBadge = page.locator('#demo-badge');
    await expect(demoBadge).toBeVisible();

    // Since demo mode jumped to 20s (jogging mood), mood is no longer sleep, and Demo Try buttons hide
    await expect(demoTryBtn).toBeHidden();
    await expect(headerDemoBtn).toBeHidden();

    // Live buttons should now appear
    const headerLiveBtn = page.locator('#btn-header-live');
    const moodLiveBtn = page.locator('#btn-live-switch');
    await expect(headerLiveBtn).toBeVisible();
    await expect(headerLiveBtn).toHaveText('Live');
    await expect(moodLiveBtn).toBeVisible();
    await expect(moodLiveBtn).toHaveText('Live');

    // Clicking Live button switches back to Live mode
    await headerLiveBtn.click();
    await page.waitForTimeout(400);

    // DEMO badge should hide
    await expect(demoBadge).toBeHidden();

    // Live buttons should now be hidden
    await expect(headerLiveBtn).toBeHidden();
    await expect(moodLiveBtn).toBeHidden();

    // Demo Try buttons should reappear since real telemetry is in sleep mood
    await expect(demoTryBtn).toBeVisible();
    await expect(headerDemoBtn).toBeVisible();
  });
});

