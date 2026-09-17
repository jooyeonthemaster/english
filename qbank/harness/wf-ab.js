export const meta = {
  name: 'qbank-ab-prompt',
  description: 'A/B 실측 — 프로덕션 공예지침 vs 심층 저작지침 (둘 다 Opus 5). 블라인드 심판 2인 + 종합',
  phases: [
    { title: 'Author', detail: '유형 3종 × 2안 = 6기. 동일 지문·동일 문항수·동일 컨테이너·각자 자가게이트' },
    { title: 'Judge', detail: '유형당 블라인드 심판 2기 — 어느 쪽이 A안인지 모른 채 채점' },
    { title: 'Synth', detail: '오탐 필터 + 승자 판정 + 이식할 요소 추출' },
  ],
}

const ROOT = 'd:\\Desktop\\2026project\\nara'
const SPEC = ROOT + '\\qbank\\spec'
const AB = ROOT + '\\qbank\\work\\ab'
const TSX = './node_modules/.bin/tsx'
const PASSAGE = '2027_06_5095396-q23'
const N = 6

// 유형 3종 — 계열을 갈라 잡는다(논지수렴 / 구조 / 서술).
// side: 블라인드 라벨 배정. 유형마다 A/B 의 갑·을 위치를 바꿔 심판이 패턴을 읽지 못하게 한다.
const CASES = [
  { subType: 'TOPIC', family: '논지수렴형', gap: 'A', eul: 'B' },
  { subType: 'SENTENCE_INSERT', family: '구조형', gap: 'B', eul: 'A' },
  { subType: 'CONDITIONAL_WRITING', family: '서술형', gap: 'A', eul: 'B' },
]

const CONTAINER = [
  '## 출력 형식 (qbank 컨테이너 — 양 안 공통, 이건 실험 변수가 아니다)',
  '문항마다 아래 헤더로 시작한다. 헤더와 헤더 사이가 그 문항의 마크다운 전문이다.',
  '```',
  '<!-- ITEM 1',
  'difficulty: BASIC|INTERMEDIATE|KILLER',
  'point: <출제 포인트 — 유닛 내 유일해야 함>',
  'craft: <설계 의도 한 줄>',
  'settings: {"optionCount":5}   (선택)',
  '-->',
  '<유형 형식 계약대로의 마크다운. 마크다운 장식(굵게·헤딩·불릿·표) 절대 금지.>',
  '```',
].join('\n')

function selfGate(subType, arm) {
  return [
    '## 자가 게이트 (0원 — PASS 날 때까지 반복하라, 최대 6회)',
    '```bash',
    'cd ' + ROOT + ' && ' + TSX + ' qbank/harness/gate.ts --passage ' + PASSAGE +
      ' --type ' + subType + ' --file qbank/work/ab/' + subType + '/' + arm + '.md --min ' + N,
    '```',
    '게이트를 통과하지 못한 산출물은 실험에서 제외된다 — 반드시 PASS 를 확인하라.',
    '**형식 때문에 지는 것은 이 실험의 관심사가 아니다.** 양 안 모두 형식은 통과시키고,',
    '차이는 오직 **공예(설계·미끼·해설·다각화)** 에서 나야 한다.',
  ].join('\n')
}

const COMMON_TAIL = (subType, arm) => [
  '',
  '## 지문 확보 (손으로 옮겨 적지 마라)',
  '```bash',
  'cd ' + ROOT + ' && node qbank/harness/passage.mjs ' + PASSAGE,
  '```',
  '',
  '## 형식 계약 (양 안 공통 필독 — 이건 실험 변수가 아니다)',
  '- ' + SPEC + '\\types\\' + subType + '.md   ← 마크다운 골격·파서 규칙·게이트 사유',
  '- ' + SPEC + '\\recon\\00-contract.md      ← 공유 계약(장식 0·마커 밖 지문 불가침·머리표)',
  '',
  CONTAINER,
  '',
  '## 산출 경로',
  '`' + AB + '\\' + subType + '\\' + arm + '.md`',
  '',
  selfGate(subType, arm),
  '',
  '## 반환',
  '`gatePassed` 는 마지막 게이트가 실제로 PASS 였을 때만 true 다. 거짓 보고 금지.',
].join('\n')

function armAPrompt(c) {
  return [
    '너는 대한민국 수능 영어 최정상 출제위원이다.',
    '아래 기출 지문으로 **' + c.subType + '** 유형 문항 **' + N + '개**를 설계하라.',
    '',
    '## ★ 너의 공예 지침 — 아래 명령으로 받아라 (이것만을 설계 지침으로 삼아라)',
    '```bash',
    'cd ' + ROOT + ' && ' + TSX + ' qbank/harness/prod-prompt.ts --type ' + c.subType +
      ' --passage ' + PASSAGE + ' --difficulty KILLER --no-passage',
    '```',
    '이 출력이 **현행 프로덕션이 모델에게 주는 설계 지침 전문**이다. 그 안의 설계 원칙·오답 기제·',
    '난이도 규정·자기검산 항목을 그대로 따르라.',
    '',
    '⚠ 단 하나의 차이: 프로덕션 지침은 **1문항** 기준으로 쓰였다. 너는 ' + N + '개를 만들어야 하므로,',
    '문항 간 중복 회피는 **그 지침이 주는 범위 안에서 네가 알아서** 하라.',
    '그 밖의 다른 설계 지침(qbank craft doctrine 등)은 **읽지도 말고 쓰지도 마라.**',
    '',
    '난이도는 ' + N + '개에 BASIC 1 / INTERMEDIATE 2 / KILLER 3 으로 배분하라(양 안 공통 조건).',
    COMMON_TAIL(c.subType, 'A'),
  ].join('\n')
}

function armBPrompt(c) {
  return [
    '너는 대한민국 수능 영어 최정상 출제위원이다.',
    '아래 기출 지문으로 **' + c.subType + '** 유형 문항 **' + N + '개**를 설계하라.',
    '',
    '## ★ 너의 공예 지침 — 아래를 정독하고 그대로 수행하라',
    '1. ' + SPEC + '\\quality-constitution.md   — 품질 헌법(A등급 7조건·실패축 V1~V5·오답 택소노미 L1~L7/F1~F7·난이도 3분기)',
    '2. ' + SPEC + '\\craft\\00-AUTHORING.md     — 공통 저작 지침',
    '3. ' + SPEC + '\\types\\' + c.subType + '.md 의 **§8 출제 포인트 다각화 축**',
    '',
    '특히 `00-AUTHORING.md` 의 작업 순서를 **반드시 그 순서대로** 수행하라:',
    '  §2 지문 해부(논지 지도: 문장번호·논지축·전개구조·전환점·대조축·인과사슬·추상사다리·근거밀도지도)',
    '  → §3 표적 배분(문항을 만들기 **전에** 난이도·겨냥지점·인지작업·정답표적·미끼팔레트를 표로 먼저)',
    '  → §4 문항 설계 → §5 적대적 자기반증 7종 → §6 해설',
    '',
    '프로덕션 프롬프트(`prod-prompt.ts`)는 **읽지 마라** — 이 안의 변수가 오염된다.',
    '',
    '난이도는 ' + N + '개에 BASIC 1 / INTERMEDIATE 2 / KILLER 3 으로 배분하라(양 안 공통 조건).',
    COMMON_TAIL(c.subType, 'B'),
  ].join('\n')
}

function judgePrompt(c, judgeIdx) {
  return [
    '너는 수능 영어 문항을 심사하는 **블라인드 심판**이다.',
    '두 벌의 문항 세트를 받는다. **어느 쪽이 어떤 방법으로 만들어졌는지 너는 모르며, 알 필요도 없다.**',
    '추측하려 하지 마라 — 추측은 판정을 오염시킨다.',
    '',
    '## 대상 (같은 지문 · 같은 유형 · 같은 문항 수 · 같은 난이도 배분)',
    '- 갑: `' + AB + '\\' + c.subType + '\\' + c.gap + '.md`',
    '- 을: `' + AB + '\\' + c.subType + '\\' + c.eul + '.md`',
    '- 유형: ' + c.subType + ' (' + c.family + ')',
    '',
    '## 지문 (사실의 유일한 원천)',
    '```bash',
    'cd ' + ROOT + ' && node qbank/harness/passage.mjs ' + PASSAGE,
    '```',
    '',
    '## 채점 기준',
    ROOT + '\\qbank\\spec\\quality-constitution.md 를 읽어라. 아래 7축을 각각 **0~10** 으로 채점한다.',
    '',
    '| 축 | 무엇을 보는가 |',
    '|---|---|',
    '| `answerUniqueness` | 정답이 유일한가. 두 선지가 함께 성립하지 않는가. **직접 풀어 보고 판정하라** |',
    '| `evidenceDepth` | 정답이 서로 다른 문장 2곳 이상으로 방어되는가 |',
    '| `decoyStrength` | 오답이 중위권을 실제로 유혹하는가. 즉사 오답이 몇 개인가 |',
    '| `decoyDiversity` | 오답 기제가 서로 다른가((L,F) 조합 중복). 같은 함정 반복이 아닌가 |',
    '| `explanationIntegrity` | 해설이 인용한 문장이 지문에 **문자 그대로** 있는가. 오귀속은 없는가 |',
    '| `pointDiversity` | ' + N + '문항이 서로 다른 인지 작업을 요구하는가. 표현만 다른 같은 문항이 있는가 |',
    '| `difficultyFit` | 표기 난이도와 실제 난이도가 맞는가. KILLER 가 한 문장으로 풀리지 않는가 |',
    '',
    '## 수행 순서 (반드시 이 순서로)',
    '1. **먼저 두 세트의 모든 문항을 직접 풀어라** — `정답:`·`해설:` 을 보기 전에.',
    '   각 문항에 대해 네 답과 confidence 를 기록한 뒤에야 정답을 확인하라.',
    '2. 그 다음 7축을 채점하라.',
    '3. 축마다 승자를 정하고 근거를 한 줄로 쓰라.',
    '4. 종합 승자와 격차를 정하라.',
    '',
    '## 규칙',
    '- **인용 없는 판정은 판정이 아니다.** 모든 근거에 문항 또는 지문 원문을 인용하라.',
    '- 길이·분량으로 판정하지 마라. 긴 해설이 좋은 해설이 아니다.',
    '- 무승부를 두려워하지 마라 — 실제로 차이가 없으면 `무승부` 로 보고하라.',
    '- 치명 결함(정답 복수 성립·정답 부재·해설이 지문에 없는 것을 인용·오귀속)은 발견 즉시 `criticalDefects` 에 기록하라.',
    '  이건 점수와 별개로 그 세트를 실격시킬 수 있는 사유다.',
    '- 너는 심판 ' + judgeIdx + '번이다. 다른 심판과 상의할 수 없으니 **네 판단만으로** 결론을 내라.',
  ].join('\n')
}

const AUTHOR_SCHEMA = {
  type: 'object',
  required: ['subType', 'arm', 'itemCount', 'gatePassed'],
  properties: {
    subType: { type: 'string' },
    arm: { type: 'string' },
    itemCount: { type: 'number' },
    gatePassed: { type: 'boolean' },
    gateAttempts: { type: 'number' },
    lastGateOutput: { type: 'string' },
    points: { type: 'array', items: { type: 'string' } },
    approachNote: { type: 'string', description: '네가 실제로 밟은 설계 과정을 3~5줄로' },
  },
}

const JUDGE_SCHEMA = {
  type: 'object',
  required: ['subType', 'judge', 'scores', 'axisWinners', 'overallWinner', 'margin'],
  properties: {
    subType: { type: 'string' },
    judge: { type: 'number' },
    blindSolve: {
      type: 'array',
      items: {
        type: 'object',
        required: ['side', 'item', 'myAnswer', 'confidence', 'matchesIntended'],
        properties: {
          side: { type: 'string', enum: ['갑', '을'] },
          item: { type: 'number' },
          myAnswer: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          matchesIntended: { type: 'boolean' },
        },
      },
    },
    scores: {
      type: 'object',
      required: ['갑', '을'],
      properties: {
        갑: { type: 'object', additionalProperties: { type: 'number' } },
        을: { type: 'object', additionalProperties: { type: 'number' } },
      },
    },
    axisWinners: {
      type: 'array',
      items: {
        type: 'object',
        required: ['axis', 'winner', 'why'],
        properties: {
          axis: { type: 'string' },
          winner: { type: 'string', enum: ['갑', '을', '무승부'] },
          why: { type: 'string', description: '문항/지문 인용을 포함할 것' },
        },
      },
    },
    criticalDefects: {
      type: 'array',
      items: {
        type: 'object',
        required: ['side', 'item', 'defect', 'evidence'],
        properties: {
          side: { type: 'string' },
          item: { type: 'number' },
          defect: { type: 'string' },
          evidence: { type: 'string' },
        },
      },
    },
    overallWinner: { type: 'string', enum: ['갑', '을', '무승부'] },
    margin: { type: 'string', enum: ['decisive', 'clear', 'slight', 'none'] },
    notableFromLoser: { type: 'string', description: '진 쪽에서 배울 만한 것(이식 후보)' },
  },
}

phase('Author')

const authored = await parallel(
  CASES.flatMap((c) => [
    () => agent(armAPrompt(c), { label: 'A:' + c.subType, phase: 'Author', schema: AUTHOR_SCHEMA }),
    () => agent(armBPrompt(c), { label: 'B:' + c.subType, phase: 'Author', schema: AUTHOR_SCHEMA }),
  ]),
)

const okPairs = CASES.filter((c, i) => {
  const a = authored[i * 2]
  const b = authored[i * 2 + 1]
  return a && b && a.gatePassed && b.gatePassed
})
log('저작 완료 — 양 안 모두 게이트 통과한 유형 ' + okPairs.length + '/' + CASES.length)

phase('Judge')

const judged = await parallel(
  okPairs.flatMap((c) => [
    () => agent(judgePrompt(c, 1), { label: 'judge1:' + c.subType, phase: 'Judge', schema: JUDGE_SCHEMA, agentType: 'quality-engineer' }),
    () => agent(judgePrompt(c, 2), { label: 'judge2:' + c.subType, phase: 'Judge', schema: JUDGE_SCHEMA, agentType: 'quality-engineer' }),
  ]),
)

phase('Synth')

// 블라인드 해제 — 갑/을 → A/B 로 되돌린다(심판은 이걸 모른 채 채점했다)
const unblinded = okPairs.map((c, i) => {
  const js = [judged[i * 2], judged[i * 2 + 1]].filter(Boolean)
  return {
    subType: c.subType,
    family: c.family,
    mapping: { 갑: c.gap, 을: c.eul },
    judges: js.map((j) => ({
      judge: j.judge,
      winnerArm: j.overallWinner === '무승부' ? '무승부' : j.overallWinner === '갑' ? c.gap : c.eul,
      margin: j.margin,
      scoresByArm: { [c.gap]: j.scores['갑'], [c.eul]: j.scores['을'] },
      axisWinners: (j.axisWinners || []).map((a) => ({
        axis: a.axis,
        winnerArm: a.winner === '무승부' ? '무승부' : a.winner === '갑' ? c.gap : c.eul,
        why: a.why,
      })),
      criticalDefects: (j.criticalDefects || []).map((d) => ({ ...d, arm: d.side === '갑' ? c.gap : c.eul })),
      notableFromLoser: j.notableFromLoser,
      blindSolveMisses: (j.blindSolve || []).filter((b) => !b.matchesIntended || b.confidence === 'low')
        .map((b) => ({ arm: b.side === '갑' ? c.gap : c.eul, item: b.item, confidence: b.confidence, matched: b.matchesIntended })),
    })),
  }
})

const synth = await agent([
  '너는 A/B 실측의 **종합자**다. 심판들의 판정을 그대로 믿지 말고 **오탐을 걸러** 결론을 내라.',
  '',
  '## 실험 설계',
  '- 같은 지문(' + PASSAGE + ') · 같은 유형 · 같은 문항 수(' + N + ') · 같은 난이도 배분 · 같은 형식 계약',
  '- **A안** = 현행 프로덕션이 모델에게 주는 공예 지침만 사용 (flash 급 모델 + 270초 데드라인 + 토큰 다이어트 아래 최적화된 물건)',
  '- **B안** = qbank 심층 저작 지침 사용 (품질 헌법 + 논지해부 → 표적배분 → 자기반증 7종)',
  '- **양 안 모두 Opus 5 가 저작했다.** 모델은 변수가 아니고 **지침만 변수**다.',
  '- 유형마다 갑/을 위치를 바꿔 심판이 패턴을 읽지 못하게 했다.',
  '',
  '## 심판 판정 (블라인드 해제 완료)',
  '```json',
  JSON.stringify(unblinded, null, 1).slice(0, 30000),
  '```',
  '',
  '## 산출물 파일 (직접 열어 확인하라 — 심판 말만 믿지 마라)',
  ...okPairs.map((c) => '- ' + AB + '\\' + c.subType + '\\{A,B}.md'),
  '',
  '## 임무',
  '1. **오탐 필터**: 근거(인용)가 없는 판정, 이미 올바른 것을 지적한 판정, 길이·분량 기준 판정을 제외하라.',
  '2. 심판 2인이 **엇갈린 축**을 찾아내고, 산출물을 직접 열어 네가 재판정하라.',
  '3. 축별 승자를 종합하라 — 어느 축에서 어느 안이 이겼는가. 그 원인은 지침의 **어느 문장** 때문인가.',
  '4. **결론**: B안을 전 유형 저작 지침으로 채택할 것인가. 조건부라면 무슨 조건인가.',
  '5. **이식 목록**: 진 쪽 지침에서 이긴 쪽으로 가져올 요소가 있는가 (프로덕션 프롬프트에 좋은 것이 있으면 명시).',
  '6. **경고**: 표본은 유형 3종 × 지문 1개다. 이걸로 일반화할 수 있는 범위와 없는 범위를 갈라 말하라.',
  '   (선행 캠페인이 "10개 표본 승자 일반화"로 실패한 전례가 있다 — 같은 실수를 반복하지 마라)',
  '',
  '산출: ' + ROOT + '\\qbank\\spec\\ab-report.md 에 보고서를 Write 하고, 스키마대로 반환하라.',
].join('\n'), {
  label: 'synth',
  phase: 'Synth',
  schema: {
    type: 'object',
    required: ['verdict', 'adopt', 'axisSummary', 'generalizability'],
    properties: {
      verdict: { type: 'string', description: '한 문단 결론' },
      adopt: { type: 'string', enum: ['B안 채택', 'B안 조건부 채택', 'A안 유지', '무승부 — 추가 실측 필요'] },
      adoptConditions: { type: 'array', items: { type: 'string' } },
      axisSummary: {
        type: 'array',
        items: {
          type: 'object',
          required: ['axis', 'winner', 'evidence'],
          properties: {
            axis: { type: 'string' },
            winner: { type: 'string' },
            evidence: { type: 'string' },
            causeInDoctrine: { type: 'string', description: '지침의 어느 문장이 이 차이를 만들었는가' },
          },
        },
      },
      transplants: { type: 'array', items: { type: 'string' }, description: 'A안에서 B안으로 이식할 요소' },
      doctrineEdits: { type: 'array', items: { type: 'string' }, description: '00-AUTHORING.md 에 반영할 개정안' },
      falsePositivesFiltered: { type: 'number' },
      generalizability: { type: 'string' },
      reportPath: { type: 'string' },
    },
  },
  agentType: 'general-purpose',
})

return { cases: CASES.length, authoredOk: okPairs.length, unblinded, synth }
