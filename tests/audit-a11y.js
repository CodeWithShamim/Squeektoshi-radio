import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function runAccessibilityAudit() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let totalViolations = 0;

  async function checkPage(label, setupFn) {
    console.log(`\n--- Accessibility Audit: ${label} ---`);
    if (setupFn) await setupFn();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze();

    console.log(`Violations Found: ${results.violations.length}`);
    if (results.violations.length > 0) {
      totalViolations += results.violations.length;
      console.warn('Violations detail:');
      results.violations.forEach((v) => {
        console.warn(`[${v.impact?.toUpperCase()}] ${v.id}: ${v.description}`);
        v.nodes.forEach((n) => console.warn(`   Target: ${n.target.join(', ')}`));
      });
    } else {
      console.log(`✅ Passed: Zero accessibility violations (${label})`);
    }
  }

  try {
    // 1. Landing page
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    await checkPage('Landing Page (index.html)');

    // 2. App Console Default
    await page.goto('http://localhost:3000/app.html', { waitUntil: 'networkidle' });
    await checkPage('Station Console (app.html default)');

    // 3. App Console with Professional Features Drawer Open
    await checkPage('Station Console (Console Drawer Open)', async () => {
      await page.locator('#btn-open-console').click();
      await page.waitForTimeout(400);
    });

    // 4. App Console with Diagnostics Panel Open
    await checkPage('Station Console (Diagnostics Panel Open)', async () => {
      await page.locator('#console-close-btn').click();
      await page.waitForTimeout(400);
      await page.locator('#btn-open-diag').click();
      await page.waitForTimeout(400);
    });

    if (totalViolations > 0) {
      console.error(`\n❌ Total violations across all states: ${totalViolations}`);
      process.exit(1);
    } else {
      console.log('\n🌟 100% WCAG 2.1 AA Compliant across all states! 0 violations.');
    }
  } finally {
    await browser.close();
  }
}

runAccessibilityAudit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
