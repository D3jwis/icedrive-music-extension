// Renders the popup screenshots in docs/images/ from the real built popup:
//   popup.png            the toolbar popup (340 px wide, dark theme)
//   detached-window.png  the mini player window (360x640)
//   popup-equalizer.png  the popup with the equalizer bands unfolded
// The extension APIs are replaced by a stub that returns a fixed player state,
// so no Icedrive account is needed.
//
//   npm run build && node docs/images/render.mjs
//
// Then re-render the images that embed these: node docs/banner/render.mjs
// and node docs/store/render.mjs. Needs Playwright with Chromium.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const BUILD = here('../../.output/chrome-mv3');
const ORIGIN = 'http://extension.test';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

const SONGS = [
  'Northbound Lights - Midnight Highway',
  'The Paper Kites Club - Slow Summer',
  'Aurora Fields - Glass Mountains',
  'Velvet Static - Neon Rain',
  'Harbor & Pine - Long Way Home',
  'Mira Sol - Golden Hour (Radio Edit)',
  'Cold Coast - Snowfall in July',
  'Lumen Drive - Weightless',
  'Echo Valley - Paper Planes',
  'The Night Shift - City of Glass',
  'Saltwater Saints - Undertow',
  'Blue Atlas - Satellite Hearts',
  'Polar Bloom - First Light',
  'Wild Meridian - Runaway',
];

const STATE = {
  active: true,
  nowPlaying: {
    title: 'Midnight Highway',
    artist: 'Northbound Lights',
    fileName: `${SONGS[0]}.flac`,
    artUrl: 'blob:https://icedrive.net/art',
  },
  paused: false,
  currentTime: 86,
  duration: 238,
  tracks: Array.from({ length: 48 }, (_, i) => ({
    id: `file-${1000 + i}`,
    fileName: `${SONGS[i % SONGS.length]}.flac`,
    area: 'cloud',
  })),
  folderName: 'Road Trip Mix',
  currentIndex: 0,
  settings: { shuffle: true, repeat: 'one' },
  hasNext: true,
  volume: 0.8,
  muted: false,
  speed: 1,
  eq: { enabled: true, preset: 'bassBoost', preamp: -5, gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  eqStatus: 'active',
};

// Playwright hides scrollbars by default; the screenshots should show ours.
const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });

// Album art: a JPEG data: URL, like the one the content script sends.
const artPage = await browser.newPage();
const ART = await artPage.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d');
  const lin = g.createLinearGradient(0, 0, 160, 160);
  lin.addColorStop(0, '#ff7a59');
  lin.addColorStop(0.5, '#c2477a');
  lin.addColorStop(1, '#3b2a8f');
  g.fillStyle = lin;
  g.fillRect(0, 0, 160, 160);
  const rad = g.createRadialGradient(110, 50, 4, 110, 50, 70);
  rad.addColorStop(0, 'rgba(255,220,150,.75)');
  rad.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = rad;
  g.fillRect(0, 0, 160, 160);
  return c.toDataURL('image/jpeg', 0.92);
});
await artPage.close();

async function shot({ out, width, height, scheme, detached, eqOpen = false, viewportOnly = false }) {
  const page = await browser.newPage({ viewport: { width, height }, colorScheme: scheme });
  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    try {
      const body = await readFile(join(BUILD, path));
      await route.fulfill({ body, contentType: TYPES[extname(path)] ?? 'application/octet-stream' });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
  await page.addInitScript(
    ({ state, art, origin, eqOpen }) => {
      globalThis.chrome = {
        runtime: { id: 'demo', getURL: (p) => origin + p, getContexts: async () => [] },
        tabs: {
          query: async () => [{ id: 1 }],
          sendMessage: async (_id, cmd) =>
            cmd.type === 'getArt' ? { sourceUrl: state.nowPlaying.artUrl, dataUrl: art } : state,
        },
        windows: { update: async () => {}, create: async () => {} },
        storage: { local: { get: async () => ({ popupEqOpen: eqOpen }), set: async () => {} } },
      };
    },
    { state: STATE, art: ART, origin: ORIGIN, eqOpen },
  );
  await page.goto(`${ORIGIN}/popup.html${detached ? '?detached=1' : ''}`);
  await page.waitForSelector('#art.has-image');
  await page.evaluate(() => document.querySelector('.tracks').scrollTo(0, 0));
  await page.waitForTimeout(150);
  const target = detached || viewportOnly ? page : page.locator('body');
  await target.screenshot({ path: here(`./${out}`) });
  await page.close();
}

await shot({ out: 'popup.png', width: 340, height: 600, scheme: 'dark' });
await shot({ out: 'detached-window.png', width: 360, height: 640, scheme: 'dark', detached: true });
// The popup with every equalizer band unfolded (a real popup is at most 600 px tall and scrolls).
await shot({ out: 'popup-equalizer.png', width: 340, height: 600, scheme: 'dark', eqOpen: true, viewportOnly: true });
await browser.close();
