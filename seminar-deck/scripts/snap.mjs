// Capture every slide (final step state) at 1920x1080 → shots/chNN.png
// usage: node scripts/snap.mjs [onlyNN,NN...]
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('C:/Users/jooye/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const N = readdirSync(join(ROOT, 'slides')).filter((f) => /^s\d+\.html$/.test(f)).length;
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
mkdirSync(join(ROOT, 'shots'), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const url = 'file:///' + join(ROOT, 'index.html').replace(/\\/g, '/');
await page.goto(url);
await page.waitForTimeout(2600); // fonts + images

for (let i = 1; i <= N; i++) {
  if (only && !only.includes(i)) continue;
  await page.evaluate((h) => { location.hash = h; }, `#/${i}/9`);
  await page.waitForTimeout(i === 1 ? 900 : 700);
  await page.screenshot({ path: join(ROOT, 'shots', `ch${String(i).padStart(2, '0')}.png`) });
  console.log(`ch${String(i).padStart(2, '0')} captured`);
}
await browser.close();
