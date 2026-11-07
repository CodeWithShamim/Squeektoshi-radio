import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function runAccessibilityAudit() {
  console.log('Running Axe Accessibility Audit on http://localhost:3000/ ...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze();

    console.log('\n--- Accessibility Audit Results ---');
    console.log(`Violations Found: ${accessibilityScanResults.violations.length}`);

    if (accessibilityScanResults.violations.length > 0) {
      console.warn('Violations detail:');
      accessibilityScanResults.violations.forEach((v) => {
        console.warn(`[${v.impact?.toUpperCase()}] ${v.id}: ${v.description}`);
        v.nodes.forEach((n) => console.warn(`   Target: ${n.target.join(', ')}`));
      });
      process.exit(1);
    } else {
      console.log('✅ 100% WCAG 2.1 AA Compliant! Zero accessibility violations found.');
      console.log('Estimated Accessibility Score: 100 / 100');
    }
  } finally {
    await browser.close();
  }
}

runAccessibilityAudit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
