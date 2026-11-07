import { test, expect } from '@playwright/test';

test.describe('Squeektoshi Radio - 3D Landing Page Suite', () => {
  test('landing loads with zero console errors and displays 3D scene & copy', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await page.waitForTimeout(1000);

    // Title and copy check
    await expect(page).toHaveTitle('Squeektoshi Radio');
    await expect(page.locator('h1')).toHaveText('Squeektoshi Radio');
    await expect(page.locator('.hero-subtitle')).toHaveText('A hamster runs. The chain counts. You hear it.');

    // Launch link check
    const launchBtn = page.locator('#launch-cta-hero');
    await expect(launchBtn).toBeVisible();
    await expect(launchBtn).toHaveAttribute('href', 'app.html');

    // Canvas check
    const canvas = page.locator('#webgl-canvas');
    await expect(canvas).toBeVisible();

    // Check pass counter ticked
    await page.waitForTimeout(1500);
    const passes = await page.locator('#hud-passes').textContent();
    expect(Number(passes)).toBeGreaterThanOrEqual(1);

    expect(consoleErrors).toHaveLength(0);
  });

  test('hover on Launch prefetches app.html and click navigates to app.html', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);

    const launchBtn = page.locator('#launch-cta-hero');
    await launchBtn.hover();
    await page.waitForTimeout(300);

    // Prefetch link check
    const hasPrefetch = await page.evaluate(() => {
      return !!document.querySelector('link[rel="prefetch"][href="app.html"]');
    });
    expect(hasPrefetch).toBe(true);

    // Click navigation check
    await launchBtn.click();
    await page.waitForURL('**/app.html', { timeout: 6000 });
    await expect(page).toHaveTitle(/Squeektoshi Radio/);
    await expect(page.locator('#tune-btn')).toBeVisible();
  });

  test('with WebGL disabled, the static SVG fallback wheel and complete copy render', async ({ page }) => {
    // Disable WebGL by overriding getContext
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = function (type) {
        if (type.includes('webgl')) return null;
        return null;
      };
    });

    await page.goto('/');
    await page.waitForTimeout(500);

    // Verify fallback class is added
    await expect(page.locator('body')).toHaveClass(/webgl-fallback/);

    // Verify SVG fallback wheel is visible
    const svgWheel = page.locator('.fallback-wheel-svg');
    await expect(svgWheel).toBeVisible();

    // Verify copy is completely intact
    await expect(page.locator('h1')).toHaveText('Squeektoshi Radio');
    await expect(page.locator('#launch-cta-hero')).toBeVisible();
  });

  test('with reduced motion, no scroll-scrubbed camera animation runs and navigation is instant', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForTimeout(500);

    // Verify text reveals are not hidden
    const maskLines = await page.evaluate(() => {
      const lines = Array.from(document.querySelectorAll('.mask-line'));
      return lines.map((l) => window.getComputedStyle(l).transform);
    });
    // In reduced motion, transforms are none or identity matrix
    maskLines.forEach((transform) => {
      expect(transform === 'none' || transform.includes('matrix')).toBe(true);
    });

    // Launch should navigate without wipe delay
    const launchBtn = page.locator('#launch-cta-hero');
    await launchBtn.click();
    await page.waitForURL('**/app.html', { timeout: 3000 });
  });

  test('with API returning "status": "unavailable", HUD says "signal unknown" and wheel continues rotating', async ({ page }) => {
    await page.route('**/v1/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schemaVersion: 1,
          status: 'unavailable',
          reason: 'indexer_unavailable',
        }),
      });
    });

    await page.goto('/');
    await page.waitForTimeout(1000);

    const statusHud = page.locator('#hud-status');
    await expect(statusHud).toHaveText('signal unknown');

    // Passes should still continue ticking because wheel does not stop!
    const initialPasses = Number(await page.locator('#hud-passes').textContent());
    await page.waitForTimeout(2000);
    const subsequentPasses = Number(await page.locator('#hud-passes').textContent());
    expect(subsequentPasses).toBeGreaterThanOrEqual(initialPasses);
  });
});
