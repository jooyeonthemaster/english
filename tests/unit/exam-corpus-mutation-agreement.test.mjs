// =============================================================================
// exam-corpus-mutation-agreement.test.mjs
//
//   기출 코퍼스(src/data/exam-passages/passages.json)를 **바꾸는 도구가 둘 이상**일 때
//   그 둘이 같은 (before, after) 에 같은 수락/거부를 내는지 지키는 게이트.
//
//   왜 이 파일이 존재하는가
//   ---------------------------------------------------------------------------
//   2026-06 사고의 실체는 **절단**이었다. 코퍼스가 상류이고 39개 학원 DB 가 하류라서,
//   상류 도구와 하류 도구의 판정이 갈리면 둘 중 하나는 반드시 틀린 상태가 된다.
//   직전 라운드의 「판정 일치 시험」은 테스트 안에서 같은 술어를 두 번 불러
//   비교하는 **동어반복**이었고(그래서 10/10 GREEN 이었다), 실제 두 구현을 호출한
//   전수 대조에서는 54,444 쌍 중 수만 건이 갈렸다.
//   이 게이트는 그 재발을 막는다.
//
//   구성
//     G1  코퍼스 자체 불변식 회귀 핀 (리포 안에서 항상 검증 가능)
//     G2  불변식 판정 계약 — 절단·두부삽입·중간삽입·단어삭제는 **어떤 도구도** 수락 불가
//     G3  발견된 불변식 모듈 전수 교차 — 두 벌 이상이면 서로 일치해야 한다
//     G4  비교기 자체의 음성테스트 — 일부러 갈라 놓고 RED 가 나는지
//
//   G3 은 작업 디렉토리(.tmp-corpus-rca, .gitignore 대상)에 도구가 설치돼 있을 때만
//   실물 모듈을 로드한다. 설치돼 있지 않으면 **발견 건수 0 을 명시적으로 출력**하고
//   계약(G2)만 검증한다 — 조용한 스킵이 아니다.
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const PASSAGES = path.join(ROOT, 'src/data/exam-passages/passages.json');
const TOOLDIR = path.join(ROOT, '.tmp-corpus-rca/final');

const wordCount = (t) => { const s = String(t).trim(); return s ? s.split(/\s+/u).length : 0; };

// ---------------------------------------------------------------------------
// G1 — 코퍼스 회귀 핀
// ---------------------------------------------------------------------------
// 저장된 wordCount 필드가 본문과 어긋난 레코드. 도구들이 이 필드를 「단어 수가
// 같으니 문자 치환이다」의 근거로 쓰기 때문에, 이 집합이 커지면 오분류가 커진다.
// 실측 2026-08-20: 37건. 늘어나면 RED.
const STALE_WORDCOUNT_IDS = [
  'ebsi_go1_20090917-q20', 'ebsi_go1_20110901-q20', 'ebsi_go1_20110901-q32',
  'ebsi_go1_20120314-q35', 'ebsi_go1_20121114-q27', 'ebsi_go1_20140612-q24',
  'ebsi_go1_20200916-q29', 'ebsi_go1_20210831-q29', 'ebsi_go1_20221123-q30',
  'ebsi_go1_20240328-q29', 'ebsi_go2_20100311-q21', 'ebsi_go2_20100311-q22',
  'ebsi_go2_20100617-q22', 'ebsi_go2_20101124-q22', 'ebsi_go2_20110310-q20',
  'ebsi_go2_20110901-q20', 'ebsi_go2_20120607_A-q24', 'ebsi_go2_20120607_B-q24',
  'ebsi_go2_20141118_A-q27', 'ebsi_go2_20150604-q28', 'ebsi_go2_20190904-q29',
  'ebsi_go2_20200916-q29', 'ebsi_go2_20210325-q29', 'ebsi_go2_20230601-q29',
  'ebsi_go2_20230906-q29', 'ebsi_go2_20240328-q30', 'ebsi_go2_20240904-q29',
  'ebsi_go2_20241015-q29', 'ebsi_go3_20090714-q22', 'ebsi_go3_20140710_A-q24',
  'ebsi_go3_20151013-q20', 'ebsi_go3_20180711-q28', 'ebsi_go3_20220706-q29',
  'ebsi_go3_20221012-q29', 'ebsi_go3_20251014-q29', 'ebsi_go3_20260324-q29',
  'ebsi_go3_20260507-q29',
];
// 본문이 바이트 동일한 레코드(대개 같은 시험의 A/B형 공용 지문). 텍스트를 키로
// 대상 레코드를 찾는 도구는 이 id 들을 특정할 수 없다.
const DUPLICATE_TEXT_ID_COUNT = 28;

const corpus = fs.existsSync(PASSAGES) ? JSON.parse(fs.readFileSync(PASSAGES, 'utf8')) : null;

test('G1-a 저장 wordCount 가 본문과 어긋난 레코드 집합이 늘지 않았다', { skip: corpus ? false : 'passages.json 부재' }, () => {
  const actual = corpus.filter((r) => r.wordCount !== wordCount(r.text)).map((r) => r.id).sort();
  assert.deepEqual(actual, [...STALE_WORDCOUNT_IDS].sort(),
    '저장 wordCount 오염 집합이 바뀌었다. 이 필드는 「단어 수가 같으면 문자 치환」\n'
    + '  판정의 근거로 쓰이므로, 오염이 늘면 단어 삭제가 문자 치환으로 승인된다.');
});

test('G1-b 본문 중복 레코드 수가 늘지 않았다', { skip: corpus ? false : 'passages.json 부재' }, () => {
  const byText = new Map();
  for (const r of corpus) { const a = byText.get(r.text) || []; a.push(r.id); byText.set(r.text, a); }
  const dup = [...byText.values()].filter((v) => v.length > 1).flat();
  assert.equal(dup.length, DUPLICATE_TEXT_ID_COUNT,
    '텍스트를 키로 대상을 찾는 도구가 특정할 수 없는 레코드 수가 바뀌었다.');
});

// ---------------------------------------------------------------------------
// G2 — 불변식 판정 계약. 도구가 무엇이든 이 표를 지켜야 한다.
// ---------------------------------------------------------------------------
const B = 'The quick brown fox jumps over the lazy dog near the river bank today.';
const FREE_ID = '__id_not_in_any_policy_list__';

/** [이름, before, after, 수락되어도 되는가] */
export const CONTRACT_CASES = [
  ['동일',                B, B,                                    null],   // null = 변경 없음
  ['순수 접미 확장',      B, B + ' Recovered tail sentence here.',  true],
  ['꼬리 절단(단어)',     B, B.split(' ').slice(0, -3).join(' '),   false],
  ['꼬리 절단(문자)',     B, B.slice(0, -3),                        false],
  ['두부 삽입',           B, 'PREFIX ' + B,                         false],
  ['두부 문자 삽입',      B, 'Z' + B,                               false],
  ['선행 공백 삽입',      B, '  ' + B,                              false],
  ['중간 삽입',           B, B.replace('fox', 'fox INJECTED'),      false],
  ['중간 문자 치환',      B, B.replace('brown', 'browm'),           false],
  ['단어 삭제',           B, B.replace('lazy ', ''),                false],
  ['단어 순서 교환',      B, B.replace('brown fox', 'fox brown'),   false],
  ['전면 교체',           B, 'Something else entirely, and longer than the original text was.', false],
];

test('G2 계약표가 스스로 정합하다 (수락 가능한 것은 접미 확장 하나뿐)', () => {
  const accepted = CONTRACT_CASES.filter((c) => c[3] === true);
  assert.equal(accepted.length, 1, '계약표에서 수락 가능한 변형은 순수 접미 확장 하나여야 한다');
  assert.equal(accepted[0][0], '순수 접미 확장');
  for (const [name, before, after, ok] of CONTRACT_CASES) {
    if (ok === null) { assert.equal(before, after, name); continue; }
    assert.notEqual(before, after, name + ': before/after 가 같으면 사례가 아니다');
    if (ok === true) assert.ok(after.startsWith(before), name + ': 접미 확장이어야 한다');
    else assert.ok(!after.startsWith(before), name + ': 접미 확장이면 거부 사례가 될 수 없다');
  }
});

// ---------------------------------------------------------------------------
// G3 — 발견된 불변식 모듈 전수 교차
// ---------------------------------------------------------------------------
/** 작업 디렉토리에서 불변식 모듈을 찾아 공통 어휘의 판정 함수로 감싼다. */
async function discoverJudges() {
  const out = [];
  if (!fs.existsSync(TOOLDIR)) return out;
  const files = fs.readdirSync(TOOLDIR).filter((f) => /^corpus-invariants.*\.mjs$/u.test(f)).sort();
  for (const f of files) {
    const mod = await import(pathToFileURL(path.join(TOOLDIR, f)).href);
    if (typeof mod.classifyInvariant === 'function') {
      out.push({ name: f, mod, ask: (id, b, a) => {
        const wl = mod.CHAR_SUBSTITUTION_WHITELIST && Object.prototype.hasOwnProperty.call(mod.CHAR_SUBSTITUTION_WHITELIST, id)
          ? mod.CHAR_SUBSTITUTION_WHITELIST[id] : undefined;
        const r = mod.classifyInvariant(id, b, a, wl);
        return b === a ? null : r.accepted;
      } });
    } else if (typeof mod.classify === 'function') {
      out.push({ name: f, mod, ask: (id, b, a) => (b === a ? null : mod.classify(b, a, id).kind !== null) });
    }
  }
  return out;
}

const judges = await discoverJudges();
// 조용한 스킵 금지 — 발견 건수를 항상 출력한다.
console.log(`[corpus-mutation-agreement] 불변식 판정 모듈 ${judges.length}개 발견`
  + (judges.length ? ': ' + judges.map((j) => j.name).join(', ') : ` (작업 디렉토리 ${TOOLDIR} 없음/비설치)`));

test('G3-a 발견된 모든 판정 모듈이 계약표를 지킨다', { skip: judges.length ? false : '판정 모듈 미설치 (발견 0개 — 위 로그 참조)' }, () => {
  const violations = [];
  for (const j of judges) {
    for (const [name, before, after, expected] of CONTRACT_CASES) {
      const got = j.ask(FREE_ID, before, after);
      if (got !== expected) violations.push(`${j.name} / ${name}: 기대 ${expected} 실제 ${got}`);
    }
  }
  assert.deepEqual(violations, [], '계약 위반:\n  ' + violations.join('\n  '));
});

test('G3-b 판정 모듈이 둘 이상이면 서로 일치한다 (R-8: 사본 금지)', { skip: judges.length >= 2 ? false : `판정 모듈 ${judges.length}개 — 교차 대상 없음` }, () => {
  // 계약표(자유 id) + **RC-4b 화이트리스트 id** 적대 사례.
  //
  //   화이트리스트 id 를 빼놓으면 이 게이트는 정확히 방어해야 할 지점에서 눈을 감는다.
  //   문자 치환이 허용되는 유일한 id 들이므로, 판정자마다 「무엇까지 치환으로 봐주는가」가
  //   갈리는 곳도 여기다. 실측 2026-08-20: 한 모듈은 하드코딩된
  //   (offset, before, after) 삼중항과 완전 일치만 수락하고, 다른 모듈은
  //   「단일 연속 델타이기만 하면」 수락해 본문 601자 중 599자 교체가 통과했다.
  const wlIds = new Set();
  for (const j of judges) {
    const m = j.mod || {};
    if (m.CHAR_SUBSTITUTION_WHITELIST) for (const id of Object.keys(m.CHAR_SUBSTITUTION_WHITELIST)) wlIds.add(id);
    if (m.RC4B_WHITELIST) for (const id of m.RC4B_WHITELIST) wlIds.add(id);
  }
  const byId = new Map((corpus ?? []).map((r) => [r.id, r]));
  const cases = CONTRACT_CASES.map(([n, b, a]) => [n, FREE_ID, b, a]);
  for (const id of wlIds) {
    const rec = byId.get(id);
    if (!rec) continue;
    const t = rec.text;
    cases.push([`화이트리스트 ${id} / 임의 문구 주입`, id, t, t.slice(0, 100) + ' ATTACKER CONTENT ' + t.slice(100)]);
    cases.push([`화이트리스트 ${id} / 본문 사실상 전량 교체`, id, t,
      t[0] + 'REPLACED. '.repeat(Math.ceil(t.length / 10) + 1) + t[t.length - 1]]);
    cases.push([`화이트리스트 ${id} / 순수 접미 확장`, id, t, t + ' legitimate recovered tail.']);
  }
  console.log(`[corpus-mutation-agreement] G3-b 대조 사례 ${cases.length}건 `
    + `(자유 id ${CONTRACT_CASES.length} + 화이트리스트 id ${wlIds.size}종)`);
  const disagreements = [];
  for (const [name, id, before, after] of cases) {
    const verdicts = judges.map((j) => [j.name, j.ask(id, before, after)]);
    const uniq = new Set(verdicts.map((v) => String(v[1])));
    if (uniq.size > 1) disagreements.push(`${name}: ` + verdicts.map(([n, v]) => `${n}=${v}`).join(' vs '));
  }
  assert.deepEqual(disagreements, [],
    '불변식 모듈끼리 판정이 갈린다 — 코퍼스 상류와 DB 하류가 서로 다른 규칙을 쓰고 있다:\n  '
    + disagreements.join('\n  '));
});

// ---------------------------------------------------------------------------
// G4 — 비교기 음성테스트: 일부러 갈라 놓으면 RED 가 나는가
// ---------------------------------------------------------------------------
test('G4 음성테스트 — 두 판정자가 갈리면 비교기가 반드시 잡아낸다', () => {
  const strict = { name: 'strict', ask: (id, b, a) => (b === a ? null : a.startsWith(b)) };
  const loose = { name: 'loose', ask: (id, b, a) => (b === a ? null : true) };   // 무엇이든 수락
  const pair = [strict, loose];
  const found = [];
  for (const [name, before, after] of CONTRACT_CASES) {
    const verdicts = pair.map((j) => j.ask(FREE_ID, before, after));
    if (new Set(verdicts.map(String)).size > 1) found.push(name);
  }
  assert.ok(found.length > 0, '갈라 놓았는데 비교기가 불일치를 하나도 못 찾았다 — 비교기가 죽어 있다');
  assert.ok(found.includes('꼬리 절단(단어)'),
    '절단에서조차 불일치를 못 잡는다 — 2026-06 사고의 실체가 절단이다');
  // 계약 위반 검출도 살아 있는가
  const looseViolations = CONTRACT_CASES.filter(([n, b, a, e]) => loose.ask(FREE_ID, b, a) !== e);
  assert.ok(looseViolations.length > 0, '전부 수락하는 판정자를 계약표가 통과시켰다 — 계약 검사가 죽어 있다');
});
