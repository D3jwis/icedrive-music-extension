// Renders the Chrome Web Store images from docs/store/assets.html:
// five 1280x800 screenshots, the 440x280 small promo tile and the 1400x560
// marquee. All are 24-bit PNGs without alpha, as the store requires.
// Needs Playwright with Chromium: `npx playwright install chromium` if it isn't installed.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const browser = await chromium.launch();
const jobs = [
  ['popup', 1280, 800, 'screenshot-1-popup.png'],
  ['mini', 1280, 800, 'screenshot-2-mini-player.png'],
  ['inpage', 1280, 800, 'screenshot-3-in-icedrive.png'],
  ['privacy', 1280, 800, 'screenshot-4-privacy.png'],
  ['eq', 1280, 800, 'screenshot-5-equalizer.png'],
  ['tile', 440, 280, 'promo-small-440x280.png'],
  ['marquee', 1400, 560, 'promo-marquee-1400x560.png'],
];
for (const [v, width, height, out] of jobs) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`file://${here('./assets.html')}?v=${v}`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: here(`./${out}`) });
  await page.close();
}
await browser.close();
