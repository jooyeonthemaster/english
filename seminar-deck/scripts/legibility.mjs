// 가독성 감사 — 세미나장 뒤에서도 읽혀야 한다.
// 텍스트를 직접 가진 요소의 실효 font-size 를 재서 임계 미만을 보고한다.
// usage: node scripts/legibility.mjs [최소px=11]
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

const require = createRequire('C:/Users/jooye/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const N = readdirSync(join(ROOT, 'slides')).filter((f) => /^s\d+\.html$/.test(f)).length;
const MIN = Number(process.argv[2] || 11);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file:///' + join(ROOT, 'index.html').replace(/\\/g, '/'));
await page.waitForTimeout(2600);

const rows = [];
for (let i = 1; i <= N; i++) {
  await page.evaluate((h) => { location.hash = h; }, `#/${i}/9`);
  await page.waitForTimeout(360);
  const r = await page.evaluate((MIN) => {
    const slide = document.querySelector('.slide.active');
    const bad = [];
    const walk = (el) => {
      for (const c of el.children) {
        const cs = getComputedStyle(c);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) { continue; }
        const own = [...c.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim())
          .map((n) => n.textContent.trim()).join(' ');
        if (own) {
          const fs = parseFloat(cs.fontSize);
          if (fs < MIN) {
            bad.push({
              px: Math.round(fs * 10) / 10,
              cls: (typeof c.className === 'string' ? c.className.trim() : '') || c.tagName.toLowerCase(),
              text: own.slice(0, 34),
            });
          }
        }
        walk(c);
      }
    };
    walk(slide);
    return { id: slide.id, bad };
  }, MIN);
  if (r.bad.length) rows.push({ i, ...r });
}
await browser.close();

console.log(`=== LEGIBILITY AUDIT (최소 ${MIN}px) ===`);
if (!rows.length) { console.log(`${MIN}px 미만 텍스트 0건 — 전 슬라이드 클린`); process.exit(0); }
for (const s of rows) {
  console.log(`\n[${String(s.i).padStart(2, '0')}] ${s.id}`);
  for (const b of s.bad) console.log(`   ${b.px}px  .${b.cls}  "${b.text}"`);
}
console.log(`\n총 ${rows.reduce((n, s) => n + s.bad.length, 0)}건 / ${rows.length}개 슬라이드`);
