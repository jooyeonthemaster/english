export const meta = {
  name: 'qbank-passage-audit',
  description: 'P0 지문 무결성 감사 — 재구성 지문의 복원 실패를 잡아낸다(그 위에 문항을 쌓기 전에)',
  phases: [
    { title: 'Audit', detail: '배치당 지문 N건. 복원 실패·절단·비문·흐름 단절을 판정' },
    { title: 'Verify', detail: '불합격 판정만 제2 감사관이 반증 시도 — 오탐 제거' },
  ],
}

// args = { batchFile: 'qbank/work/audit-001.json', batchCount: 12, label: '...' }
//
// 배치 목록을 args 에 싣지 않는다 — 에이전트가 배치 파일에서 자기 슬라이스를 직접 읽는다.
// ① args 가 작게 유지되고 ② 슬라이스가 파일에 고정돼 있어 재개해도 배정이 흔들리지 않는다.
// args 가 JSON 문자열로 올 수도 있다(툴 호출에서 문자열로 직렬화되는 경우) — 양쪽을 받는다.
const A = typeof args === 'string' ? JSON.parse(args) : args || {}
const BATCH_FILE = A.batchFile || 'qbank/work/audit-001.json'
const BATCH_COUNT = A.batchCount || 0
if (!BATCH_COUNT) throw new Error('args.batchCount 가 없다 — 받은 args: ' + JSON.stringify(args).slice(0, 200))
const BATCHES = Array.from({ length: BATCH_COUNT }, (_, i) => i)

const ROOT = 'd:\\Desktop\\2026project\\nara'

const FRAMING = [
  '## ★ 판정 태세 (이걸 잘못 잡으면 감사 전체가 무가치해진다)',
  '',
  '이 지문들은 **실제 수능·모의평가·학력평가 기출 원문**이다. 창작물이 아니다.',
  '그러므로 **어색해 보인다는 이유로 오류라고 판정하면 안 된다** — KICE 지문은 원래 통사가 무겁고',
  '명사화가 빽빽하며 수동태가 잦다. 그게 정상이다.',
  '',
  '**너의 임무는 "이 지문이 좋은 글인가"를 판정하는 것이 아니다.**',
  '**"출제용 변형을 되돌리는 과정에서 훼손됐는가"를 판정하는 것이다.**',
  '',
  '이 코퍼스의 56%는 출제 변형(빈칸 뚫기·어법 오류 주입·어휘 치환·문단 뒤섞기·문장 추출·무관 문장 삽입)을',
  '**되돌린 재구성본**이다. 되돌리기가 실패했다면:',
  '- `grammar_error` → 주입된 문법 오류가 **잔존**한다 (기계가 절대 못 잡는다 — 네가 유일한 방어선)',
  '- `vocab_error` → 문맥에 안 맞는 단어가 **잔존**한다',
  '- `order` → 문단이 **뒤섞인 채** 저장됐다 (논리 흐름이 끊긴다)',
  '- `insertion` → 빼냈던 문장이 **안 돌아왔거나 엉뚱한 자리**에 들어갔다',
  '- `irrelevant` → 끼워 넣었던 **무관한 문장이 남아 있다**',
  '- `blank` → 빈칸 자리가 **안 채워졌거나 원문과 다른 표현**으로 채워졌다',
  '',
  '## 판정 규칙 (양방향 가드)',
  '- **명백한 것만 지적하라.** 확신이 없으면 `uncertain` 으로 표시하고 `ok: true` 를 유지하라.',
  '  근거 없는 격리는 멀쩡한 기출 지문을 버리는 일이다.',
  '- **모든 지적에 원문 인용을 붙여라.** 인용 없는 지적은 지적이 아니다.',
  '- 문체·난이도·주제에 대한 의견은 쓰지 마라. 오직 **훼손 여부**만 본다.',
  '- 반대로 **전건 통과 보고도 의심하라** — 재구성본이 절반을 넘는데 전부 완벽할 리 없다.',
  '  최소한 무엇을 어떻게 확인했는지는 남겨라.',
].join('\n')

const KINDS = [
  '`GRAMMAR_RESIDUAL` — 문법 오류 잔존(주어-동사 수일치, 동사/준동사, 태, 관계사, 병렬, 형/부 등)',
  '`VOCAB_RESIDUAL` — 문맥과 정반대이거나 부적합한 단어 잔존',
  '`ORDER_BROKEN` — 문단·문장 배열이 뒤섞여 지시어의 선행어가 뒤에 오거나 인과가 역전',
  '`SENTENCE_MISSING` — 논리 도약. 있어야 할 연결 문장이 없다',
  '`SENTENCE_EXTRANEOUS` — 논지와 무관한 문장이 끼어 있다',
  '`BLANK_UNRESTORED` — 빈칸 자리가 비었거나 어색하게 메워졌다',
  '`TRUNCATED` — 앞이나 뒤가 잘렸다',
  '`INCOHERENT` — 위 어디에도 안 들어가는 명백한 의미 단절',
]

function auditPrompt(sliceIdx) {
  return [
    '너는 기출 영어 지문의 **무결성 감사관**이다.',
    '',
    FRAMING,
    '',
    '## 대상 지문 — 아래 명령으로 네 배치 목록을 받아라 (배치 ' + (sliceIdx + 1) + ')',
    '```bash',
    'cd ' + ROOT + ' && node qbank/harness/audit-batch.mjs --slice ' + sliceIdx + ' --from ' + BATCH_FILE,
    '```',
    '출력은 `{id, year, kind, wordCount, screenIssues}` 배열이다. **이 목록의 지문만** 감사하라.',
    '',
    '각 지문 원문은 아래 명령으로 받아라. **손으로 옮기면 판정이 오염된다.**',
    '```bash',
    'cd ' + ROOT + ' && node qbank/harness/passage.mjs <passageId> --meta',
    '```',
    '',
    '## 감사 절차 (지문마다)',
    '1. 원문을 받아 **두 번** 읽어라. 한 번은 흐름, 한 번은 문장 단위.',
    '2. 복원 종류에 해당하는 **표적 검사**를 먼저 하라:',
    '   - `grammar_error` → 모든 정형동사의 수·시제·태, 준동사 자리, 관계사, 병렬 구조를 **하나하나** 검사',
    '   - `vocab_error` → 논지 방향과 어긋나는 단어가 있는지(특히 반의어로 치환됐던 자리)',
    '   - `order`/`insertion` → 지시어(this/these/such/the+명사)의 선행어가 **앞에** 있는지 전수 확인',
    '   - `irrelevant` → 논지 축에서 벗어난 문장이 있는지',
    '   - `blank` → 부자연스럽거나 논리적으로 붕 뜬 구절이 있는지',
    '3. 그 다음 일반 검사: 절단·비문·의미 단절.',
    '',
    '## 지적 종류',
    ...KINDS.map((k) => '- ' + k),
    '',
    '## 산출 (지문마다 1개 파일)',
    '`' + ROOT + '\\qbank\\out\\<year>\\<passageId>\\_passage.json` 에 아래 형태로 Write 하라.',
    '디렉토리는 Write 가 자동 생성한다. `<year>` 는 `--meta` 출력의 `year` 값이다.',
    '```json',
    '{',
    '  "id": "<passageId>",',
    '  "auditedAt": "<ISO8601>",',
    '  "reconstructionKind": "<kind>",',
    '  "integrity": {',
    '    "ok": true,',
    '    "confidence": "high|medium|low",',
    '    "checkedFor": ["<수행한 표적 검사 목록>"],',
    '    "issues": [',
    '      { "kind": "GRAMMAR_RESIDUAL", "severity": "block|warn",',
    '        "quote": "<원문 축자 인용>", "explain": "<무엇이 왜 틀렸는가>",',
    '        "suggestedFix": "<이 표현을 무엇으로 고쳐야 원문인가>", "certain": true }',
    '    ]',
    '  }',
    '}',
    '```',
    '- `integrity.ok` 는 **`severity:"block"` 인 `certain:true` 지적이 하나도 없을 때만** true 다.',
    '- 지적이 없어도 `checkedFor` 는 반드시 채워라 — 무엇을 봤는지가 기록돼야 한다.',
    '',
    '## 반환',
    '스키마대로. `blocked` 는 실제로 `ok:false` 로 판정한 지문만 넣어라.',
  ].join('\n')
}

function verifyPrompt(items) {
  return [
    '너는 **제2 감사관**이다. 1차 감사관이 "훼손됐다"고 판정한 지문들을 받았다.',
    '너의 임무는 그 판정을 **반증하는 것**이다.',
    '',
    '## 왜 반증인가',
    '이 지문들은 실제 기출 원문이다. 잘못 격리하면 멀쩡한 자료를 영영 못 쓴다.',
    '1차 감사관이 KICE 특유의 무거운 통사를 오류로 오인했을 가능성이 실재한다.',
    '**기본값은 `refuted: true`(1차 판정이 틀렸다) 다.** 명백히 훼손됐을 때만 `refuted: false` 로 확정하라.',
    '',
    '## 대상',
    '```json',
    JSON.stringify(items, null, 1).slice(0, 20000),
    '```',
    '',
    '## 절차 (지적마다)',
    '```bash',
    'cd ' + ROOT + ' && node qbank/harness/passage.mjs <passageId>',
    '```',
    '1. 원문을 받아 **지적된 구절을 문맥 속에서** 다시 읽어라.',
    '2. 그 표현이 정문으로 성립하는 해석이 **하나라도** 있는지 찾아라.',
    '   - 긴 주어의 핵을 잘못 잡은 것은 아닌가',
    '   - 축약 관계절·분사구문·도치·동격으로 성립하지 않는가',
    '   - 학문명·집합명사의 단복수 관례가 아닌가',
    '   - 그 단어가 그 문맥에서 실제로 쓰이는 용법이 아닌가',
    '3. 성립하면 `refuted: true` + 그 해석을 적어라.',
    '4. 어떤 해석으로도 성립하지 않으면 `refuted: false` + 왜 불가능한지 적어라.',
    '',
    '## 규칙',
    '- "어색하다"는 반증 실패 사유가 아니다. **문법적으로 불가능한가**만 본다.',
    '- 판정이 갈리면(성립 여부가 미묘하면) `refuted: true` 로 하고 `borderline: true` 를 표시하라 —',
    '  애매한 지문은 격리 대신 **어법 유형만 제외**하는 편이 낫다.',
  ].join('\n')
}

const AUDIT_SCHEMA = {
  type: 'object',
  required: ['batch', 'audited', 'blocked'],
  properties: {
    batch: { type: 'number' },
    audited: { type: 'number' },
    blocked: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'kind', 'quote', 'explain'],
        properties: {
          id: { type: 'string' },
          kind: { type: 'string' },
          severity: { type: 'string' },
          quote: { type: 'string' },
          explain: { type: 'string' },
          suggestedFix: { type: 'string' },
          certain: { type: 'boolean' },
        },
      },
    },
    warned: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, kind: { type: 'string' }, quote: { type: 'string' } } } },
    filesWritten: { type: 'number' },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'quote', 'refuted', 'reasoning'],
        properties: {
          id: { type: 'string' },
          quote: { type: 'string' },
          refuted: { type: 'boolean', description: 'true = 1차 판정이 틀렸다(지문은 정상)' },
          borderline: { type: 'boolean' },
          reasoning: { type: 'string' },
          recommendation: { type: 'string', enum: ['keep', 'quarantine', 'restrict-grammar-types'] },
        },
      },
    },
  },
}

phase('Audit')

const audits = await parallel(
  BATCHES.map((i) => () =>
    agent(auditPrompt(i), {
      label: 'audit:' + (i + 1),
      phase: 'Audit',
      schema: AUDIT_SCHEMA,
      agentType: 'general-purpose',
    }),
  ),
)

const allBlocked = audits.filter(Boolean).flatMap((a) => a.blocked || [])
log('1차 감사 완료 — 배치 ' + audits.filter(Boolean).length + '/' + BATCHES.length + ' · 훼손 판정 ' + allBlocked.length + '건')

phase('Verify')

// 반증은 지문 단위로 묶어 보낸다(같은 지문의 여러 지적을 한 감사관이 한 문맥에서 본다)
const byPassage = {}
for (const b of allBlocked) {
  if (!byPassage[b.id]) byPassage[b.id] = []
  byPassage[b.id].push(b)
}
const verifyGroups = []
const ids = Object.keys(byPassage)
for (let i = 0; i < ids.length; i += 6) {
  verifyGroups.push(ids.slice(i, i + 6).map((id) => ({ id, issues: byPassage[id] })))
}

const verified = verifyGroups.length
  ? await parallel(
      verifyGroups.map((g, i) => () =>
        agent(verifyPrompt(g), {
          label: 'verify:' + (i + 1),
          phase: 'Verify',
          schema: VERIFY_SCHEMA,
          agentType: 'quality-engineer',
        }),
      ),
    )
  : []

const verdicts = verified.filter(Boolean).flatMap((v) => v.verdicts || [])
const confirmed = verdicts.filter((v) => !v.refuted)
const refuted = verdicts.filter((v) => v.refuted)
const restrict = verdicts.filter((v) => v.recommendation === 'restrict-grammar-types')

log(
  '반증 완료 — 1차 지적 ' + verdicts.length +
  ' · 확정(훼손) ' + confirmed.length +
  ' · 반증(정상) ' + refuted.length +
  ' · 유형제한 권고 ' + restrict.length,
)

return {
  batches: BATCHES.length,
  auditedBatches: audits.filter(Boolean).length,
  passagesAudited: audits.filter(Boolean).reduce((a, x) => a + (x.audited || 0), 0),
  firstPassBlocked: allBlocked.length,
  verdicts: verdicts.length,
  confirmedBroken: confirmed.map((v) => ({ id: v.id, quote: v.quote, why: v.reasoning })),
  refutedCount: refuted.length,
  restrictOnly: restrict.map((v) => ({ id: v.id, why: v.reasoning })),
  falsePositiveRate: verdicts.length ? +(refuted.length / verdicts.length).toFixed(3) : null,
}
