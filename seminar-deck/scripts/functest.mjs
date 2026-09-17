// ============================================================
// SMOAT LINE 덱 — 행동 게이트
// 스크린샷으로는 잡히지 않는 인터랙션·부작용·기하를 실제 조작으로 검증한다.
// usage: node scripts/functest.mjs
// ============================================================
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('C:/Users/jooye/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'file:///' + join(ROOT, 'index.html').replace(/\\/g, '/');

const results = [];
const pass = (name, extra = '') => results.push({ ok: true, name, extra });
const fail = (name, why) => results.push({ ok: false, name, why });
const check = (cond, name, why) => (cond ? pass(name) : fail(name, why));

const browser = await chromium.launch();

/* ---------------- 1. 초기 로드 / 콘솔 ---------------- */
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));
await page.goto(URL);
await page.waitForTimeout(2600);

check(consoleErrors.length === 0, '초기 로드 콘솔 에러 0건', consoleErrors.join(' | '));

const N = await page.evaluate(() => document.querySelectorAll('.slide').length);
check(N === 27, `슬라이드 27장 (실제 ${N}장)`, `기대 27, 실제 ${N}`);

/* ---------------- 2. 슬라이드 메타 무결성 ---------------- */
const meta = await page.evaluate(() =>
  [...document.querySelectorAll('.slide')].map((s) => ({
    id: s.id,
    title: s.dataset.title || '',
    kr: s.dataset.kr || '',
    zone: s.dataset.zone || '',
    part: s.dataset.part || '',
    dIn: s.dataset.in || '',
    dOut: s.dataset.out || '',
    paper: s.classList.contains('slide--paper'),
    steps: Math.max(0, ...[...s.querySelectorAll('[data-step]')].map((e) => +e.dataset.step || 0)),
  }))
);
const missingMeta = meta.filter((m) => !m.title || !m.kr || !m.zone || !m.part || !m.dIn || !m.dOut);
check(missingMeta.length === 0, '전 슬라이드 data-* 메타 완비',
  missingMeta.map((m) => m.id).join(','));
const tooManySteps = meta.filter((m) => m.steps > 5);
check(tooManySteps.length === 0, '스텝 5 이하', tooManySteps.map((m) => `${m.id}=${m.steps}`).join(','));

/* ---------------- 3. 키 내비게이션 ---------------- */
await page.evaluate(() => { location.hash = '#/1'; });
await page.waitForTimeout(400);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(300);
let h = await page.evaluate(() => location.hash);
check(/#\/1\/1|#\/2/.test(h), '→ 키로 스텝/슬라이드 전진', `hash=${h}`);

await page.evaluate(() => { location.hash = '#/5'; });
await page.waitForTimeout(400);
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(300);
h = await page.evaluate(() => location.hash);
check(/#\/4/.test(h), '← 키로 이전 슬라이드', `hash=${h}`);

await page.keyboard.press('End');
await page.waitForTimeout(300);
h = await page.evaluate(() => location.hash);
check(h.startsWith('#/27'), 'End 키로 마지막 슬라이드', `hash=${h}`);

/* ---------------- 4. LINE MAP 오버뷰 + 부작용 없음 ---------------- */
await page.evaluate(() => { location.hash = '#/3'; });
await page.waitForTimeout(350);
await page.keyboard.press('g');
await page.waitForTimeout(350);
let mapOpen = await page.evaluate(() => document.getElementById('linemap').classList.contains('open'));
check(mapOpen, 'G 키로 LINE MAP 열림');

const cellCount = await page.evaluate(() => document.querySelectorAll('#linemap .cell').length);
check(cellCount === N, `LINE MAP 셀 ${N}개`, `실제 ${cellCount}`);

// 셀 클릭 → 그 슬라이드로 점프하고 맵이 닫혀야 하며, 추가 전진(부작용)이 없어야 한다
await page.evaluate(() => document.querySelectorAll('#linemap .cell')[11].click());
await page.waitForTimeout(400);
h = await page.evaluate(() => location.hash);
mapOpen = await page.evaluate(() => document.getElementById('linemap').classList.contains('open'));
check(h.startsWith('#/12') && !mapOpen, 'LINE MAP 셀 클릭 → 정확히 그 슬라이드로 점프, 부작용 없음', `hash=${h} open=${mapOpen}`);

/* ---------------- 5. 레일 노드 클릭 ---------------- */
await page.evaluate(() => document.querySelectorAll('#rail .node')[6].click());
await page.waitForTimeout(400);
h = await page.evaluate(() => location.hash);
check(h.startsWith('#/7'), '레일 노드 클릭 → 해당 공정 이동 (전역 클릭 오발 없음)', `hash=${h}`);

/* ---------------- 6. READOUT 이 슬라이드마다 갱신 ---------------- */
const readouts = [];
for (const i of [1, 7, 13, 19, 24, 27]) {
  await page.evaluate((k) => { location.hash = `#/${k}`; }, i);
  await page.waitForTimeout(280);
  readouts.push(await page.evaluate(() => ({
    in: document.getElementById('ro-in').textContent,
    out: document.getElementById('ro-out').textContent,
    zone: document.getElementById('hud-zone').textContent,
  })));
}
check(new Set(readouts.map((r) => r.in + r.out)).size === readouts.length,
  'READOUT(IN/OUT)이 공정마다 다르게 갱신', JSON.stringify(readouts));

/* ---------------- 7. 인터랙티브 장표 개별 검증 ---------------- */
const interact = async (slideNo, name, steps, atStep = 9) => {
  await page.evaluate(([k, st]) => { location.hash = `#/${k}/${st}`; }, [slideNo, atStep]);
  await page.waitForTimeout(700);
  const before = await page.evaluate(() => location.hash);
  try {
    for (const s of steps) {
      if (typeof s === 'number') { await page.waitForTimeout(s); continue; }
      const el = await page.$(s.sel);
      if (!el) { fail(name, `셀렉터 없음: ${s.sel}`); return; }
      await el.click({ timeout: 4000 });
      await page.waitForTimeout(s.wait || 420);
      if (s.assert) {
        const ok = await page.evaluate(s.assert);
        if (!ok) { fail(name, `단언 실패 (after ${s.sel})`); return; }
      }
    }
    const after = await page.evaluate(() => location.hash);
    if (after.split('/')[1] !== before.split('/')[1]) {
      fail(name, `인터랙션이 슬라이드를 전진시킴(부작용): ${before} → ${after}`);
      return;
    }
    pass(name);
  } catch (e) {
    fail(name, String(e.message).slice(0, 140));
  }
};

// s02 — 아젠다: PART 블록 클릭 → 상세 패널 교체
await interact(3, 's02 아젠다: PART 블록 클릭 → 상세 교체', [
  { sel: "#s02 .lane[data-p='2'] .blk", assert: () => (document.querySelector('#s02-det-t')?.textContent || '').trim().length > 0 },
  { sel: "#s02 .lane[data-p='1'] .blk", assert: () => (document.querySelector('#s02-det-t')?.textContent || '').trim().length > 0 },
]);

// s06 — 투입 경로 3칩 토글
await interact(7, 's06 투입 경로 칩 → 우측 카드 상태 변경', [
  { sel: '#s06 .s06-path:nth-of-type(2)', assert: () => !!document.querySelector('#s06-desc')?.textContent.trim() },
  { sel: '#s06 .s06-path:nth-of-type(3)', assert: () => !!document.querySelector('#s06-desc')?.textContent.trim() },
]);

// s07 — 분석 4층 칩
await interact(8, 's07 분석 층 칩 → 활성 전환', [
  { sel: '#s07 .s07-layer:nth-of-type(3)',
    assert: () => document.querySelector('#s07-card').dataset.focus === '2' },
  { sel: '#s07 .s07-layer:nth-of-type(1)',
    assert: () => document.querySelector('#s07-card').dataset.focus === '0' },
]);

// s08 — 25유형 칩 → 우측 문항 교체 (덱 핵심 인터랙션)
await interact(9, 's08 유형 칩 클릭 → 문항 교체', [
  { sel: "#s08 [data-k='ORDER']",
    assert: () => document.querySelector('#s08').innerText.includes('주어진 글 다음에 이어질') },
  { sel: "#s08 [data-k='COND']",
    assert: () => document.querySelector('#s08').innerText.includes('조건') },
]);

// s09 — 정답·해설 토글
await interact(10, 's09 정답·해설 토글 → 펼침', [
  { sel: '#s09 .ex__toggle',
    assert: () => [...document.querySelectorAll('#s09 .ex__ans')].some((e) => !e.hidden && e.offsetHeight > 0) },
]);

// s10 — 콜아웃 마커
await interact(11, 's10 콜아웃 마커 클릭 → 설명 강조', [
  { sel: '#s10 .s10-mk:nth-of-type(1)', assert: () => !!document.querySelector('#s10 .s10-cl') },
]);

// s11 — 다운로드 메뉴 6항
await interact(12, 's11 다운로드 항목 클릭 → 확장자 반영', [
  { sel: "#s11 .wb-it[data-ext='docx']",
    assert: () => (document.querySelector('#s11-ext')?.textContent || '').trim() === 'docx' },
  { sel: "#s11 .wb-it[data-ext='pdf']",
    assert: () => (document.querySelector('#s11-ext')?.textContent || '').trim() === 'pdf' },
]);

// s12 — 학습 활동 9종 토글 + 카운터
await interact(13, 's12 학습 활동 토글 → 선택 카운터 갱신', [
  { sel: '#s12 .s12-act:nth-of-type(1)', assert: () => /\d/.test((document.querySelector('#s12-n')?.textContent || '')) },
  { sel: '#s12 .s12-act:nth-of-type(2)', assert: () => /\d/.test((document.querySelector('#s12-n')?.textContent || '')) },
]);

// s13 — 웹툰 뷰어 스크롤 리셋
await interact(14, 's13 웹툰 [처음으로] → 스크롤 top', [
  { sel: '#s13-reset', assert: () => (document.querySelector('#s13-scroll')?.scrollTop ?? 0) === 0 },
]);

// s15 — 과제 컴포저 3패널 + 배포
await interact(16, 's15 컴포저 선택 → 과제 보내기 → 배포 배너', [
  { sel: '#s15 [data-what]:nth-of-type(2)', assert: () => true },
  { sel: '#s15 [data-who]:nth-of-type(1)', assert: () => true },
  { sel: '#s15-send',
    assert: () => document.querySelector('#s15').innerText.includes('보냈습니다') },
]);

// s16 — 학생 태블릿: 선지 선택 → 제출 → 채점 결과
await interact(17, 's16 학생 태블릿: 선지 선택 → 제출 → 채점', [
  { sel: "#s16-opts .gd-option[data-v='3']",
    assert: () => document.querySelector("#s16-opts .gd-option[data-v='3']").getAttribute('data-state') === 'selected' },
  { sel: '#s16-submit',
    assert: () => !document.getElementById('s16-res').hidden
      && document.querySelector("#s16-opts .gd-option[data-v='2']").getAttribute('data-state') === 'correct'
      && document.querySelector("#s16-opts .gd-option[data-v='3']").getAttribute('data-state') === 'wrong' },
]);

// s17 — 폰 3화면 포커스 전환
await interact(18, 's17 폰 탭 전환 → 포커스 이동', [
  { sel: "#s17 .s17-mtabs .mt[data-go='2']",
    assert: () => document.querySelector("#s17 .s17-mtabs .mt[data-go='2']").classList.contains('is-on') },
]);

// s18 — 리포트 드릴다운 (행 클릭 + 문항 탭)
await interact(19, 's18 리포트: 유형 행 클릭 + 오답 문항 탭 전환', [
  { sel: '#s18-rows .lg-row:nth-of-type(2)', assert: () => true },
  { sel: '#s18-tabs .dp-tab:nth-of-type(2)',
    assert: () => document.querySelector('#s18').innerText.includes('제목') },
  { sel: '#s18-tabs .dp-tab:nth-of-type(1)',
    assert: () => document.querySelector('#s18').innerText.includes('수일치') },
]);

// s19 — 루프: 취약 셀 → 팝오버 → 배포 완료 (서사의 정점)
// ⚠ 상태 '변화'를 단언한다. 최종 상태만 보면 패널이 처음부터 열려 있어도 통과해버린다(실제로 그런 회귀가 있었다).
await page.evaluate(() => { location.hash = '#/20/1'; });   // 클릭 전 단계
await page.waitForTimeout(700);
const s19pre = await page.evaluate(() => ({
  pop: document.getElementById('s19-pop').hidden,
  sent: document.getElementById('s19-sent').hidden,
}));
check(s19pre.pop && s19pre.sent, 's19 클릭 전에는 ②③ 패널이 닫혀 있음 (라이브 데모 가능)',
  JSON.stringify(s19pre));

await interact(20, 's19 루프: 취약 셀 → 과제 보내기 → 배포 완료', [
  { sel: '#s19-cell', assert: () => !document.getElementById('s19-pop').hidden },
  { sel: '#s19-cta', wait: 1000,
    assert: () => !document.getElementById('s19-sent').hidden
      && document.querySelector('#s19-fp3').innerText.includes('보냈습니다') },
], 1);

// 최종 스텝에서는 아무도 클릭하지 않아도 흐름이 완주돼 화면이 비지 않아야 한다
await page.evaluate(() => { location.hash = '#/20/9'; });
await page.waitForTimeout(900);
const s19fin = await page.evaluate(() => ({
  pop: document.getElementById('s19-pop').hidden,
  sent: document.getElementById('s19-sent').hidden,
}));
check(!s19fin.pop && !s19fin.sent, 's19 최종 스텝은 클릭 없이도 3단 완주 (캡처·미클릭 대비)',
  JSON.stringify(s19fin));

// s20 — 어법 드릴 판정
await interact(21, 's20 어법 드릴: 번호 선택 → 정오 판정', [
  { sel: '#s20-opts .gd-sq:nth-of-type(3)',
    assert: () => /정답|오답/.test(document.querySelector('#s20').innerText) },
]);

// s23 — 카톡 원본 캡처 확대 보기 (열림 → 닫힘, 내비 오발 없음)
await interact(24, 's23 캡처 클릭 → 확대 렌즈 열림 → 렌즈 클릭 → 닫힘', [
  { sel: '#s23 .cap[data-zoom="a"]', wait: 420,
    assert: () => !document.getElementById('s23-lens').hidden
      && /hit-kakao-1618/.test(document.getElementById('s23-lens-img').getAttribute('src') || '') },
  { sel: '#s23-lens', wait: 380,
    assert: () => document.getElementById('s23-lens').hidden },
  { sel: '#s23 .cap[data-zoom="b"]', wait: 420,
    assert: () => !document.getElementById('s23-lens').hidden
      && /hit-kakao-b/.test(document.getElementById('s23-lens-img').getAttribute('src') || '') },
  { sel: '#s23-lens', wait: 380,
    assert: () => document.getElementById('s23-lens').hidden },
]);

// s23 — 단서(불리한 문장)가 최종 스텝에 실제로 보여야 한다. COPY_SPEC §0-적중 삭제 금지 조항의 자동 게이트.
await page.evaluate(() => { location.hash = '#/24/9'; });
await page.waitForTimeout(700);
const caveatShown = await page.evaluate(() => {
  const el = document.querySelector('#s23 .s23-caveat');
  if (!el) return false;
  const cs = getComputedStyle(el);
  return +cs.opacity > 0.9 && el.innerText.includes('선지만 의미가 좀 달라요');
});
check(caveatShown, 's23 단서 "선지만 의미가 좀 달라요" 최종 스텝에 표시 (증거 무결성)');

// s25 — 쿠폰 등록 시뮬레이션 (구 s23 — 적중 2장 삽입으로 번호 이동)
await interact(26, 's25 쿠폰 등록 → 지급 완료 카드', [
  { sel: '#s25-btn', wait: 1300,
    assert: () => !document.getElementById('s25-ok').hidden
      && document.getElementById('s25-ok').innerText.includes('크레딧이 지급되었습니다') },
]);

/* ---------------- 8. 다중 뷰포트 — 스테이지 fit & centered ---------------- */
for (const vp of [{ width: 1536, height: 735 }, { width: 1280, height: 650 }, { width: 2400, height: 1200 }]) {
  const p2 = await browser.newPage({ viewport: vp });
  await p2.goto(URL + '#/5');
  await p2.waitForTimeout(1400);
  const r = await p2.evaluate(() => {
    const b = document.getElementById('stage').getBoundingClientRect();
    return { l: b.left, t: b.top, w: b.width, h: b.height, vw: innerWidth, vh: innerHeight };
  });
  const fits = r.w <= r.vw + 2 && r.h <= r.vh + 2;
  const centered = Math.abs((r.l + r.w / 2) - r.vw / 2) < 2 && Math.abs((r.t + r.h / 2) - r.vh / 2) < 2;
  check(fits && centered, `${vp.width}×${vp.height} 스테이지 fit&centered`,
    `rect=${JSON.stringify(r)} fits=${fits} centered=${centered}`);
  await p2.close();
}

await browser.close();

/* ---------------- 리포트 ---------------- */
const failed = results.filter((r) => !r.ok);
console.log('\n=== FUNCTEST ===');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  ← ' + r.why}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
