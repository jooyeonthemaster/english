// LINE MAP 오버뷰 캡처
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('C:/Users/jooye/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file:///' + join(ROOT, 'index.html').replace(/\\/g, '/') + '#/6');
await page.waitForTimeout(2400);
await page.keyboard.press('g');
await page.waitForTimeout(600);
await page.screenshot({ path: join(ROOT, 'shots', 'linemap.png') });
console.log('linemap captured');
await browser.close();
