// 감독 통람 — 스텝 리빌 중간 상태 + 프로젝터 해상도 렌더 확인
// usage: node scripts/walkthrough.mjs [viewportW] [viewportH]
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('C:/Users/jooye/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = Number(process.argv[2] || 1920);
const H = Number(process.argv[3] || 1080);
const N = readdirSync(join(ROOT, 'slides')).filter((f) => /^s\d+\.html$/.test(f)).length;
const OUT = join(ROOT, 'shots', `walk-${W}x${H}`);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto('file:///' + join(ROOT, 'index.html').replace(/\\/g, '/'));
await page.waitForTimeout(2600);

// 슬라이드별 스텝 수 조사
const steps = await page.evaluate(() =>
  [...document.querySelectorAll('.slide')].map((s) => ({
    id: s.id,
    kr: s.dataset.kr,
    max: Math.max(0, ...[...s.querySelectorAll('[data-step]')].map((e) => +e.dataset.step || 0)),
  }))
);

const report = [];
for (let i = 1; i <= N; i++) {
  const info = steps[i - 1];
  for (let k = 0; k <= info.max; k++) {
    await page.evaluate((h) => { location.hash = h; }, `#/${i}/${k}`);
    await page.waitForTimeout(k === 0 ? 620 : 420);
    // 이 스텝에서 보이는 텍스트 분량 측정 — 빈 화면 스텝 감지
    const m = await page.evaluate(() => {
      const s = document.querySelector('.slide.active');
      const vis = [...s.querySelectorAll('[data-step]')].filter((e) => e.classList.contains('on'));
      const hidden = [...s.querySelectorAll('[data-step]')].filter((e) => !e.classList.contains('on'));
      const txt = (s.innerText || '').replace(/\s+/g, ' ').trim();
      return { visBlocks: vis.length, hiddenBlocks: hidden.length, chars: txt.length };
    });
    report.push({ i, id: info.id, kr: info.kr, k, ...m });
    await page.screenshot({ path: join(OUT, `s${String(i).padStart(2, '0')}-k${k}.png`) });
  }
}
await browser.close();

console.log(`=== WALKTHROUGH ${W}×${H} — ${N}장 / ${report.length}스텝 ===`);
// 스텝 0에서 화면이 사실상 비는 경우 = 발표 첫 인상이 빈 화면
const thin = report.filter((r) => r.k === 0 && r.chars < 120);
console.log(thin.length ? '\n⚠ 진입 시 내용이 빈약한 슬라이드:' : '\n진입 시 빈 화면 슬라이드 없음');
thin.forEach((r) => console.log(`   ${r.id} ${r.kr} — step0 글자 ${r.chars}자, 노출블록 ${r.visBlocks}/${r.visBlocks + r.hiddenBlocks}`));

console.log('\n슬라이드별 스텝 수:');
console.log(steps.map((s, i) => `${String(i + 1).padStart(2, '0')}:${s.max}`).join('  '));
console.log(`\n캡처: ${OUT}`);
