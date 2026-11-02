// Renders public/icon/*.png from the SVG sources using the preinstalled Playwright Chromium.
// Usage: node assets-src/render-icons.cjs assets-src/icon.svg assets-src/icon-small.svg public/icon [preview.png]
// 16 and 32 px use icon-small.svg (simplified for the toolbar), larger sizes use icon.svg.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
(async () => {
  const [,, big, small, outDir, preview] = process.argv;
  const b = await chromium.launch(); const p = await b.newPage();
  fs.mkdirSync(outDir, { recursive: true });
  for (const s of [16, 32, 48, 96, 128]) {
    const svg = fs.readFileSync(s <= 32 ? small : big, 'utf8');
    await p.setViewportSize({ width: s, height: s });
    await p.setContent(`<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${s}" height="${s}" style="display:block"></body></html>`);
    await p.waitForTimeout(50);
    await p.screenshot({ path: path.join(outDir, `${s}.png`), omitBackground: true });
  }
  if (preview) {
    const img = s => `<img src="file://${path.resolve(outDir)}/${s}.png" style="width:${s}px;margin:10px">`;
    const row = bg => `<div style="background:${bg};padding:12px;display:flex;align-items:center">${[16,32,48,96,128].map(img).join('')}</div>`;
    await p.setViewportSize({ width: 460, height: 560 });
    await p.goto('file:///dev/null').catch(()=>{});
    await p.setContent(row('#ffffff') + row('#202124') + row('#dfe1e5'));
    await p.waitForTimeout(200);
    await p.screenshot({ path: preview });
  }
  await b.close();
})();
