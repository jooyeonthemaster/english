export const meta = {
  name: 'qbank-authoring',
  description: 'QBANK 유닛 저작 파이프라인 — 저작(자가게이트 루프) → 적대검수 5렌즈 → 수리 → 확정',
  phases: [
    { title: 'Author', detail: '유닛당 1기: 논지해부 → 표적배분 → 저작 → 0원 게이트 자가통과' },
    { title: 'Review', detail: '새로운 눈: 블라인드풀이·사실검수·형식·미끼·다각화 5렌즈' },
    { title: 'Repair', detail: 'critical/major 수리 후 재게이트' },
  ],
}

// args = { units: [{passageId, year, subType, variants, wordCount, tier}], label }
// 지문 본문은 args 에 싣지 않는다 — 400유닛 배치에서 args 가 수백 KB가 된다.
// 에이전트가 qbank/harness/passage.mjs 로 직접 조회한다(축자 정확성도 그쪽이 안전하다).
// args 가 JSON 문자열로 올 수도 있다(툴 호출에서 직렬화되는 경우) — 양쪽을 받는다.
const A = typeof args === 'string' ? JSON.parse(args) : args || {}
const UNITS = A.units || []
if (!UNITS.length) throw new Error('args.units 가 비었다 — 받은 args: ' + JSON.stringify(args).slice(0, 200))

const ROOT = 'd:\\Desktop\\2026project\\nara'
const SPEC = ROOT + '\\qbank\\spec'
const TSX = './node_modules/.bin/tsx'

const READING = [
  '## 필독 (이 순서로 반드시 Read 하라 — 건너뛰면 반드시 반려된다)',
  '1. ' + SPEC + '\\quality-constitution.md      — 품질 헌법(A등급 정의·오답 택소노미 L1~L7/F1~F7·검수 5렌즈)',
  '2. ' + SPEC + '\\craft\\00-AUTHORING.md        — 공통 저작 지침(논지해부·표적배분·자기반증)',
  '3. ' + SPEC + '\\craft\\<SUBTYPE>.md           — 유형별 공예 지침(있으면. 없으면 생략)',
  '4. ' + SPEC + '\\types\\<SUBTYPE>.md           — ★ 형식 계약(마크다운 골격·파서 규칙·게이트 사유 전수)',
  '5. ' + SPEC + '\\recon\\00-contract.md         — 공유 계약(장식 0·마커 밖 지문 불가침·머리표)',
].join('\n')

const HARDRULES = [
  '## 절대 규칙 (위반 = 유닛 전체 반려)',
  '- **장식 0**: 굵게·헤딩·불릿·인용·표·백틱을 머리표와 선지 줄에 절대 쓰지 마라.',
  '  정본(빈칸·어법) 파서는 장식을 흡수하지 않아 `**정답:**` 를 쓰면 정답이 통째로 사라진다.',
  '- **마커 밖 지문 불가침**: 지문 변형 유형은 마커(`[[A:표현]]`/`[[1]]`/`[[1:문장]]`/`[[them]]`) 밖을',
  '  한 글자도 바꿀 수 없다. 오타처럼 보여도 원문이다.',
  '- **정답 머리표는 유형마다 다르다**: 객관식 `정답:`, 조건부영작·문장전환·어순배열 `모범답안:`,',
  '  요약문영작·주제문쓰기 `정답(A):` 계열. 형식 계약 문서를 확인하라.',
  '- **수를 채우려 품질을 낮추지 마라**: N개를 못 만들면 만든 만큼만 내고 사유를 보고하라.',
].join('\n')

function authorPrompt(u) {
  const dir = ROOT + '\\qbank\\out\\' + u.year + '\\' + u.passageId
  return [
    '너는 대한민국 수능·내신 영어 문항을 설계하는 최정상 출제위원이다.',
    '',
    '## 임무',
    '아래 기출 지문으로 **' + u.subType + '** 유형 변형문항 **' + u.variants + '개**를 설계하라.',
    '문항 하나하나가 서로 다른 출제 포인트를 겨냥해야 하며, 겹치면 0원 게이트가 유닛 전체를 반려한다.',
    '',
    READING.replace(/<SUBTYPE>/g, u.subType),
    '',
    HARDRULES,
    '',
    '## 지문 확보 (★ 손으로 옮겨 적지 마라 — 한 글자만 달라도 유닛 전체가 반려된다)',
    '```bash',
    'cd ' + ROOT + ' && node qbank/harness/passage.mjs ' + u.passageId + ' --meta',
    '```',
    '이 명령이 출력하는 본문이 **유일한 원문**이다. (' + u.year + '년 · ' + u.wordCount + '단어)',
    '',
    '## 산출 경로',
    '`' + dir + '\\' + u.subType + '.md`',
    '컨테이너 형식은 craft/00-AUTHORING.md §7 을 따른다:',
    '```',
    '<!-- ITEM 1',
    'difficulty: BASIC|INTERMEDIATE|KILLER',
    'point: <겨냥 지점 + 인지 작업. 유닛 내에서 유일해야 한다>',
    'craft: <설계 의도 — 최강 미끼가 무엇이고 왜인지>',
    'settings: {"optionCount":5}   (선택 — 유형이 지원하는 노브만)',
    '-->',
    '<형식 계약대로의 마크다운. 장식 0.>',
    '```',
    '',
    '## ★ 자가 게이트 루프 (반드시 수행 — 이게 이 임무의 절반이다)',
    '.md 를 쓴 뒤 아래를 실행하라. **0원이므로 통과할 때까지 반복해도 비용이 없다.**',
    '```bash',
    'cd ' + ROOT + ' && ' + TSX + ' qbank/harness/gate.ts --passage ' + u.passageId + ' --type ' + u.subType,
    '```',
    '- `PASS` 가 나올 때까지 고쳐라. 최대 6회 시도.',
    '- 「형식 차단」은 파서·게이트 위반이다 → 형식 계약 문서를 다시 읽고 고쳐라.',
    '- 「품질 차단」은 validateQuestionQuality error 다 → 메시지가 지목하는 필드를 고쳐라.',
    '- `POINT_DUPLICATE` = point 값이 겹쳤다. `ANSWER_DUPLICATE` = 두 문항의 정답이 같다.',
    '  이건 형식이 아니라 **설계 실패**다 — 문구만 바꾸지 말고 겨냥 지점 자체를 다시 잡아라.',
    '- 6회 안에 통과 못 하면 마지막 게이트 출력을 그대로 보고하라(숨기지 마라).',
    '',
    '## 반환',
    '스키마대로 반환하라. `gatePassed` 는 **마지막 게이트 실행이 실제로 PASS 였을 때만** true 다.',
    '거짓 보고는 이 프로젝트에서 가장 비싼 실패다 — 검수 함대가 허공을 검수하게 된다.',
  ].join('\n')
}

function reviewPrompt(u) {
  const dir = ROOT + '\\qbank\\out\\' + u.year + '\\' + u.passageId
  return [
    '너는 이 문항들을 **처음 보는 적대적 검수관**이다. 저작자가 아니다.',
    '너의 임무는 결함을 찾는 것이다. **0건 발견은 충분히 안 봤다는 뜻이다.**',
    '',
    '## 대상',
    '- 문항 파일: `' + dir + '\\' + u.subType + '.md`',
    '- 게이트 결과: `' + dir + '\\' + u.subType + '.gate.json` (형식은 이미 통과했다 — 형식을 다시 보지 마라)',
    '- 유형: ' + u.subType + ' · 지문 id: ' + u.passageId,
    '',
    '## 필독',
    SPEC + '\\quality-constitution.md — 특히 §1(A등급 7조건) §2(실패축 V1~V5·C5) §3(오답 택소노미) §8(검수 5렌즈)',
    '',
    '## 지문 확보 (사실의 유일한 원천)',
    '```bash',
    'cd ' + ROOT + ' && node qbank/harness/passage.mjs ' + u.passageId,
    '```',
    '',
    '## 5렌즈를 **전부** 수행하라',
    '',
    '### ① 블라인드 풀이 (가장 중요)',
    '**먼저 `정답:`·`해설:`·`오답:` 을 보지 말고** 지문과 선지만으로 각 문항을 실제로 풀어라.',
    '너의 답과 confidence(high/medium/low)를 먼저 기록한 다음, 그때서야 정답을 확인하라.',
    '- 불일치 → **V2 critical**',
    '- confidence low → **V2 major** (정답이 유일하지 않다는 신호)',
    '- 두 선지가 모두 성립한다고 느꼈다면 그 자체가 critical 이다',
    '',
    '### ② 품질·사실 검수 (V4 — 가장 자주 새는 축)',
    '해설의 **모든 주장**을 지문과 대조하라.',
    '- 해설이 인용한 영어 문장이 지문에 **문자 그대로** 있는가? 없으면 critical.',
    '- 해설이 지문에 없는 배경지식을 근거로 쓰는가? → critical.',
    '- 오답 해설의 라벨이 실제 그 선지를 가리키는가? (오귀속은 캠페인 최다 F 사고) → critical.',
    '- 정답이 서로 다른 문장 2곳으로 방어되는가? (BASIC 은 1곳 허용) → 미달이면 major.',
    '',
    '### ③ 형식 규정 (게이트가 못 보는 것만)',
    '- 선지 층위가 통일됐는가 (하나만 진술문/명사구면 형식으로 걸러진다)',
    '- 길이 편향 (정답만 길거나 짧은가)',
    '- 극단어(always/never/only/모든/절대) 편중',
    '- 해설 언어 규약 (한자·가나·"영단어+다" 짜깁기)',
    '',
    '### ④ 미끼 심사',
    '오답마다 **decoyPull 0~10**(중위권이 이걸 고를 확률)과 **(L,F) 코드**를 부여하라.',
    '- 목표: BASIC ≥3 / INTERMEDIATE ≥5 / KILLER ≥7. 미달 → major',
    '- 같은 F코드 3회 이상 → 실격(critical)',
    '- 즉사 오답(소재만 봐도 소거)이 과반 → critical',
    '- 오답의 반박 근거가 지문 문장 인용으로 제시됐는가',
    '',
    '### ⑤ 다각화 심사 (유닛 전체를 동시에 보라)',
    '- 두 문항이 **사실상 같은 것을 묻는가** (표현만 다르고 인지작업이 같음) → major',
    '- 난이도 분포가 한쪽으로 쏠렸는가',
    '- point 값이 실제 내용과 일치하는가 (문구만 다르게 쓴 위장)',
    '',
    '## 판정 규칙',
    '- **critical** = 출하 불가. 반드시 수리.',
    '- **major** = 수리 대상.',
    '- **minor** = 기록만.',
    '- 근거 없는 추측을 findings 에 넣지 마라. 모든 finding 에 **지문 인용 또는 문항 인용**을 붙여라.',
    '- 반대로 **0건 보고는 받아들여지지 않는다** — 최소한 minor 라도 무엇을 검토했는지 남겨라.',
    '',
    '## 산출',
    '`' + dir + '\\' + u.subType + '.review.json` 에 스키마와 동일한 JSON 을 Write 하고, 같은 내용을 반환하라.',
  ].join('\n')
}

function repairPrompt(u, review) {
  const dir = ROOT + '\\qbank\\out\\' + u.year + '\\' + u.passageId
  return [
    '너는 검수 지적을 **실제로 고치는** 수리 담당이다. 저작자도 검수자도 아니다.',
    '',
    '## 대상',
    '`' + dir + '\\' + u.subType + '.md`',
    '',
    '## 수리해야 할 지적 (critical/major 만)',
    '```json',
    JSON.stringify(review, null, 1).slice(0, 12000),
    '```',
    '',
    '## 지문 확보 (사실의 원천)',
    '```bash',
    'cd ' + ROOT + ' && node qbank/harness/passage.mjs ' + u.passageId,
    '```',
    '',
    '## 필독',
    SPEC + '\\quality-constitution.md · ' + SPEC + '\\types\\' + u.subType + '.md · ' + SPEC + '\\craft\\00-AUTHORING.md',
    '',
    '## 규칙',
    '- 지적된 문항만 고쳐라. 통과한 문항은 **손대지 마라**(회귀 방지).',
    '- 지적이 틀렸다고 판단되면 고치지 말고 `skipped` 로 사유와 함께 보고하라 — 검수 오탐도 실재한다.',
    '- 수리 후 **반드시** 게이트를 다시 돌려 PASS 를 확인하라:',
    '```bash',
    'cd ' + ROOT + ' && ' + TSX + ' qbank/harness/gate.ts --passage ' + u.passageId + ' --type ' + u.subType,
    '```',
    '- 게이트가 깨졌으면 통과할 때까지 고쳐라(0원이다).',
    '',
    '## 반환',
    '지적별로 fixed / skipped / no_change_needed 를 명시하라. **고치지 않고 fixed 라고 하지 마라.**',
  ].join('\n')
}

const AUTHOR_SCHEMA = {
  type: 'object',
  required: ['passageId', 'subType', 'itemCount', 'gatePassed'],
  properties: {
    passageId: { type: 'string' },
    subType: { type: 'string' },
    itemCount: { type: 'number' },
    requestedCount: { type: 'number' },
    gatePassed: { type: 'boolean', description: '마지막 게이트 실행이 실제로 PASS 였는가' },
    gateAttempts: { type: 'number' },
    lastGateOutput: { type: 'string', description: '실패 시 마지막 게이트 출력 전문' },
    points: { type: 'array', items: { type: 'string' }, description: '문항별 point 값' },
    difficultyMix: { type: 'string' },
    shortfallReason: { type: 'string', description: '요청 수보다 적게 만들었다면 그 사유' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['passageId', 'subType', 'blindSolve', 'findings'],
  properties: {
    passageId: { type: 'string' },
    subType: { type: 'string' },
    blindSolve: {
      type: 'array',
      description: '문항별 블라인드 풀이 결과',
      items: {
        type: 'object',
        required: ['item', 'myAnswer', 'confidence', 'matchesIntended'],
        properties: {
          item: { type: 'number' },
          myAnswer: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          matchesIntended: { type: 'boolean' },
          competingOption: { type: 'string', description: '함께 성립한다고 느낀 선지가 있으면' },
        },
      },
    },
    decoyScores: {
      type: 'array',
      items: {
        type: 'object',
        required: ['item', 'maxDecoyPull'],
        properties: {
          item: { type: 'number' },
          maxDecoyPull: { type: 'number' },
          strongest: { type: 'string' },
          codes: { type: 'array', items: { type: 'string' }, description: '"②: L2+F1" 형식' },
        },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['item', 'lens', 'severity', 'axis', 'summary', 'evidence'],
        properties: {
          item: { type: 'number', description: '유닛 전체 지적이면 0' },
          lens: { type: 'string', enum: ['blind', 'fact', 'format', 'decoy', 'diversity'] },
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
          axis: { type: 'string', enum: ['V1', 'V2', 'V3', 'V4', 'V5', 'C5', 'other'] },
          summary: { type: 'string' },
          evidence: { type: 'string', description: '지문 또는 문항 직접 인용 — 없으면 finding 이 아니다' },
          suggestedFix: { type: 'string' },
        },
      },
    },
    grade: { type: 'string', enum: ['A', 'B', 'C', 'F'], description: '유닛 종합 등급' },
  },
}

const REPAIR_SCHEMA = {
  type: 'object',
  required: ['passageId', 'subType', 'gatePassed', 'outcomes'],
  properties: {
    passageId: { type: 'string' },
    subType: { type: 'string' },
    gatePassed: { type: 'boolean' },
    outcomes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['summary', 'outcome'],
        properties: {
          summary: { type: 'string' },
          outcome: { type: 'string', enum: ['fixed', 'skipped', 'no_change_needed'] },
          note: { type: 'string' },
        },
      },
    },
  },
}

phase('Author')

// 이미 게이트를 통과한 유닛은 저작을 건너뛴다 — 재개 시 완료분 재저작 방지 +
// 감독이 손수 만든 견본이 팬아웃에 덮이지 않게 하는 장치(불변조건 I6 의 예외가 아니라 보완).
const ALREADY_AUTHORED = new Set(['GATED', 'REVIEW_ISSUES', 'REVIEWED'])

const results = await pipeline(
  UNITS,
  // 1) 저작 + 자가 게이트 루프
  (u) => {
    if (ALREADY_AUTHORED.has(u.status)) {
      return { passageId: u.passageId, subType: u.subType, itemCount: -1, gatePassed: true, gateAttempts: 0, skipped: true }
    }
    return agent(authorPrompt(u), {
      label: 'author:' + u.subType + '@' + u.passageId,
      phase: 'Author',
      schema: AUTHOR_SCHEMA,
    })
  },
  // 2) 적대 검수 (새로운 눈) — 저작이 게이트를 통과한 유닛만
  (authored, u) => {
    if (!authored || !authored.gatePassed) return { unit: u, authored, review: null, repair: null, blocked: 'AUTHOR_GATE_FAILED' }
    return agent(reviewPrompt(u), {
      label: 'review:' + u.subType + '@' + u.passageId,
      phase: 'Review',
      schema: REVIEW_SCHEMA,
      agentType: 'quality-engineer',
    }).then((review) => ({ unit: u, authored, review, repair: null, blocked: null }))
  },
  // 3) 수리 (critical/major 가 있을 때만)
  (state, u) => {
    if (!state || state.blocked || !state.review) return state
    const need = (state.review.findings || []).filter((f) => f.severity === 'critical' || f.severity === 'major')
    if (!need.length) return state
    return agent(repairPrompt(u, { findings: need }), {
      label: 'repair:' + u.subType + '@' + u.passageId,
      phase: 'Repair',
      schema: REPAIR_SCHEMA,
    }).then((repair) => ({ ...state, repair, repairedCount: need.length }))
  },
)

const done = results.filter(Boolean)
const authoredOk = done.filter((r) => r.authored && r.authored.gatePassed).length
const skippedAuthor = done.filter((r) => r.authored && r.authored.skipped).length
const gateFailed = done.filter((r) => r.blocked === 'AUTHOR_GATE_FAILED')
const repaired = done.filter((r) => r.repair).length
const criticals = done.reduce((a, r) => a + ((r.review && r.review.findings) || []).filter((f) => f.severity === 'critical').length, 0)

log('저작 게이트 통과 ' + authoredOk + '/' + UNITS.length + ' (기존 산출 재사용 ' + skippedAuthor + ') · 검수 critical ' + criticals + ' · 수리 ' + repaired + ' · 저작실패 ' + gateFailed.length)

return {
  batch: A.label || 'unnamed',
  total: UNITS.length,
  authoredOk,
  skippedAuthor,
  gateFailedUnits: gateFailed.map((r) => ({
    passageId: r.unit.passageId,
    subType: r.unit.subType,
    lastGateOutput: (r.authored && r.authored.lastGateOutput) || null,
    attempts: (r.authored && r.authored.gateAttempts) || 0,
  })),
  repaired,
  criticals,
  grades: done.filter((r) => r.review).reduce((acc, r) => {
    const g = r.review.grade || '?'
    acc[g] = (acc[g] || 0) + 1
    return acc
  }, {}),
  shortfalls: done
    .filter((r) => r.authored && r.authored.shortfallReason)
    .map((r) => ({ passageId: r.unit.passageId, subType: r.unit.subType, got: r.authored.itemCount, want: r.unit.variants, why: r.authored.shortfallReason })),
}
