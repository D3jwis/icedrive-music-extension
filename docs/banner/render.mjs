// Renders docs/banner/banner.html to docs/images/banner.png (2x for sharp display on GitHub)
// and docs/banner/social-preview.html to docs/images/social-preview.png (1280x640, GitHub's size).
// Needs Playwright with Chromium: `npx playwright install chromium` if it isn't installed.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Plain `require` so a globally installed Playwright (NODE_PATH) also works.
const { chromium } = createRequire(import.meta.url)('playwright');
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 400 }, deviceScaleFactor: 2 });
await page.goto(`file://${here('./banner.html')}`);
await page.waitForLoadState('networkidle');
await page.screenshot({ path: here('../images/banner.png') });

const social = await browser.newPage({ viewport: { width: 1280, height: 640 } });
await social.goto(`file://${here('./social-preview.html')}`);
await social.waitForLoadState('networkidle');
await social.screenshot({ path: here('../images/social-preview.png') });
await browser.close();
