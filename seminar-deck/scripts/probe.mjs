// 임시 인터랙션 프로브: 지정 슬라이드에서 셀렉터를 순서대로 클릭하고 캡처한다.
// usage: node scripts/probe.mjs <slideNo> <out.png> "<sel1>" "<sel2>" ...
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('C:/Users/jooye/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [no, out, ...sels] = process.argv.slice(2);
mkdirSync(join(ROOT, 'shots'), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
await page.goto('file:///' + join(ROOT, 'index.html').replace(/\\/g, '/') + `#/${no}/9`);
await page.waitForTimeout(2400);
for (const s of sels) {
  await page.click(s, { timeout: 5000 });
  await page.waitForTimeout(420);
}
await page.waitForTimeout(500);
await page.screenshot({ path: join(ROOT, 'shots', out) });
console.log('captured', out, '| console errors:', errs.length ? errs : 'none');
await browser.close();
