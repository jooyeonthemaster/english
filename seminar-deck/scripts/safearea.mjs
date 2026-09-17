// ============================================================
// 안전영역 / 겹침 자동 감사 — 전 슬라이드 최종 스텝 상태에서
// 텍스트를 가진 요소의 실제 rect 를 재서 침범을 좌표로 잡는다.
// usage: node scripts/safearea.mjs
// ============================================================
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

const require = createRequire('C:/Users/jooye/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const N = readdirSync(join(ROOT, 'slides')).filter((f) => /^s\d+\.html$/.test(f)).length;

const SAFE = { t: 96, b: 980, l: 96, r: 1824 }; // 하단 콘텐츠 한계 = 1080-100

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file:///' + join(ROOT, 'index.html').replace(/\\/g, '/'));
await page.waitForTimeout(2600);

const report = [];
for (let i = 1; i <= N; i++) {
  await page.evaluate((h) => { location.hash = h; }, `#/${i}/9`);
  await page.waitForTimeout(420);
  const r = await page.evaluate((SAFE) => {
    const slide = document.querySelector('.slide.active');
    const id = slide.id;
    const out = [];
    const stage = document.getElementById('stage').getBoundingClientRect();
    const walk = (el) => {
      for (const c of el.children) {
        const cs = getComputedStyle(c);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
        // 직접 텍스트 노드를 가진 요소만 (컨테이너 제외)
        const ownText = [...c.childNodes]
          .filter((n) => n.nodeType === 3 && n.textContent.trim())
          .map((n) => n.textContent.trim()).join(' ');
        const b = c.getBoundingClientRect();
        const box = { x: b.left - stage.left, y: b.top - stage.top, w: b.width, h: b.height };
        if (ownText && box.w > 0 && box.h > 0) {
          const viol = [];
          if (box.y < SAFE.t - 1) viol.push(`top ${Math.round(box.y)}`);
          if (box.y + box.h > SAFE.b + 1) viol.push(`bottom ${Math.round(box.y + box.h)}`);
          if (box.x < SAFE.l - 1) viol.push(`left ${Math.round(box.x)}`);
          if (box.x + box.w > SAFE.r + 1) viol.push(`right ${Math.round(box.x + box.w)}`);
          if (viol.length) {
            out.push({
              tag: c.tagName.toLowerCase() + (c.className && typeof c.className === 'string' ? '.' + c.className.trim().split(/\s+/).join('.') : ''),
              text: ownText.slice(0, 40),
              box: { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h) },
              viol,
            });
          }
        }
        walk(c);
      }
    };
    walk(slide);
    // 가로 오버플로 (스테이지 밖으로 흐르는 요소)
    const overflow = slide.scrollWidth > 1921 || slide.scrollHeight > 1081;
    return { id, out, overflow, sw: slide.scrollWidth, sh: slide.scrollHeight };
  }, SAFE);
  if (r.out.length || r.overflow) report.push({ i, ...r });
}

await browser.close();

console.log('=== SAFE AREA AUDIT (safe: y 96~980, x 96~1824) ===');
if (!report.length) { console.log('침범 0건 — 전 슬라이드 클린'); process.exit(0); }
for (const s of report) {
  console.log(`\n[${String(s.i).padStart(2, '0')}] ${s.id}${s.overflow ? `  ⚠ OVERFLOW ${s.sw}×${s.sh}` : ''}`);
  for (const v of s.out) {
    console.log(`   ${v.viol.join(', ')}  |  ${v.tag}`);
    console.log(`      box=${JSON.stringify(v.box)}  "${v.text}"`);
  }
}
console.log(`\n총 ${report.reduce((n, s) => n + s.out.length, 0)}건 / ${report.length}개 슬라이드`);
