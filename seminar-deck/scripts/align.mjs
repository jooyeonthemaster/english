// ============================================================
// 정렬 감사 — 다열 레이아웃의 끝선(위/아래)이 어긋난 곳을 좌표로 잡는다.
// safearea.mjs 는 "안전영역 밖으로 나갔나"만 본다. 이 스크립트는 "끝선이 맞나"를 본다.
//
// 판정 원리: 완전 정렬(≤2px)은 정상, 큰 오프셋(≥GAP_OK)은 의도된 연출로 본다.
//            그 사이의 "어중간한 어긋남"이 눈에 울퉁불퉁하게 읽힌다 → 그것만 잡는다.
// usage: node scripts/align.mjs [onlyNN,NN...]
// ============================================================
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('C:/Users/jooye/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const N = readdirSync(join(ROOT, 'slides')).filter((f) => /^s\d+\.html$/.test(f)).length;
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;

const SNAP = 2;    // 이하 = 정렬된 것으로 본다
const GAP_OK = 64; // 이상 = 의도된 큰 오프셋으로 본다

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file:///' + join(ROOT, 'index.html').replace(/\\/g, '/'));
await page.waitForTimeout(2600);

const report = [];
for (let i = 1; i <= N; i++) {
  if (only && !only.includes(i)) continue;
  await page.evaluate((h) => { location.hash = h; }, `#/${i}/9`);
  await page.waitForTimeout(420);

  const r = await page.evaluate(({ SNAP, GAP_OK }) => {
    const slide = document.querySelector('.slide.active');
    const stage = document.getElementById('stage').getBoundingClientRect();
    const out = [];

    const rect = (el) => {
      const b = el.getBoundingClientRect();
      return { t: b.top - stage.top, b: b.bottom - stage.top, l: b.left - stage.left, r: b.right - stage.left, w: b.width, h: b.height };
    };
    const visible = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
      if (cs.position === 'absolute' || cs.position === 'fixed') return false; // 절대배치 데코는 제외
      const b = el.getBoundingClientRect();
      return b.width > 24 && b.height > 24;
    };
    const label = (el) =>
      el.tagName.toLowerCase() +
      (typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
        : '');

    const walk = (el, depth) => {
      const cs = getComputedStyle(el);
      const isRow =
        (cs.display === 'grid' && (cs.gridTemplateColumns.split(' ').filter(Boolean).length > 1)) ||
        ((cs.display === 'flex' || cs.display === 'inline-flex') && cs.flexDirection.startsWith('row'));

      if (isRow) {
        const kids = [...el.children].filter(visible);
        if (kids.length >= 2) {
          const boxes = kids.map((k) => ({ n: label(k), ...rect(k) }));

          // 진짜로 여러 행에 걸친 배치일 때만 행을 나눈다.
          // 윗선이 다르다는 이유로 나누면, 잡아야 할 "어긋난 열"을 스스로 버리게 된다.
          const colCount = cs.display === 'grid'
            ? cs.gridTemplateColumns.split(' ').filter(Boolean).length
            : Infinity;
          const wraps = (cs.flexWrap === 'wrap') || (cs.display === 'grid' && kids.length > colCount);

          const groups = [];
          if (wraps) {
            const rows = new Map();
            boxes.forEach((b) => {
              const key = Math.round(b.t / 24);
              if (!rows.has(key)) rows.set(key, []);
              rows.get(key).push(b);
            });
            rows.forEach((v) => { if (v.length >= 2) groups.push(v); });
          } else {
            groups.push(boxes);
          }

          for (const sameRow of groups) {
          if (sameRow && sameRow.length >= 2) {
            // 주요 열(레이아웃 최상위 2단계)은 어긋남 크기와 무관하게 전부 보고한다.
            // 87px 어긋난 3열 레이아웃을 "의도된 오프셋"으로 봐주면 감사의 의미가 없다.
            const isMain = depth <= 1;
            const ceiling = isMain ? Infinity : GAP_OK;
            for (const edge of ['t', 'b']) {
              const vals = sameRow.map((b) => b[edge]);
              const min = Math.min(...vals), max = Math.max(...vals);
              const spread = max - min;
              if (spread > SNAP && spread < ceiling) {
                out.push({
                  main: isMain,
                  container: label(el),
                  edge: edge === 't' ? '윗선' : '아랫선',
                  spread: Math.round(spread),
                  items: sameRow.map((b) => `${b.n}@${Math.round(b[edge])}`),
                });
              }
            }
          }
          }
        }
      }
      for (const c of el.children) walk(c, depth + 1);
    };

    const pad = slide.querySelector('.pad') || slide;
    walk(pad, 0);
    return { id: slide.id, out };
  }, { SNAP, GAP_OK });

  if (r.out.length) report.push({ i, ...r });
}

console.log(`=== 정렬 감사 (스냅 허용 ${SNAP}px · 의도 오프셋 기준 ${GAP_OK}px) ===\n`);
let total = 0;
for (const s of report) {
  console.log(`[${String(s.i).padStart(2, '0')}] ${s.id}`);
  for (const v of s.out) {
    total++;
    console.log(`   ${v.edge} ${v.spread}px 어긋남  |  ${v.container}`);
    console.log(`      ${v.items.join('  ')}`);
  }
  console.log('');
}
console.log(total === 0 ? '어긋남 0건 — 전 슬라이드 정렬 클린' : `총 ${total}건 / ${report.length}개 슬라이드`);
await browser.close();
