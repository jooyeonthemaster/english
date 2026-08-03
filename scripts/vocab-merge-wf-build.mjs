// 4단계 sense 병합 — 판정 워크플로 조립기
//
// 왜 조립기인가: 추출 단계에서 배운 것과 같다. 브리프를 손으로 다시 쓰면 조립 자체가 사고
// 지점이 된다. 규범은 `docs/vocab-corpus-spec.md` 에서 **그 시점 정본**을 슬라이스해 인라인한다.
//
// 왜 샤드는 인라인하지 않나: 샤드 17개 합이 1.18MB 라 512KB 스크립트 한도를 넘는다. 그리고
// 샤드는 에이전트마다 달라 인라인해도 프롬프트 캐시 이득이 없다 — 자기 샤드 하나만 Read 시킨다.
// (추출 단계의 "Read 금지"는 **모든 에이전트가 같은 스펙·견본을 반복해서 읽는 것**을 막으려던
//  규칙이다. 자기 배정분 1회 읽기는 그 대상이 아니다.)
//
//   node scripts/vocab-merge-wf-build.mjs <이름> [--only=s0014,s0015] [--out=<dir>] [--model=sonnet]
//     --only   샤드 부분집합 (A/B·재시도용)
//     --out    산출 디렉터리 (기본 merge/out). A/B 는 별도 디렉터리로 빼야 정답지를 안 덮는다
//     --model  에이전트 모델 강제 (기본: 세션 모델 상속)
import fs from 'fs'

const WF = 'C:/Users/jooye/.claude/projects/d--Desktop-2026project-nara/652b2631-b720-4406-af94-8b903824aaf1/workflows/scripts/'
const ROOT = 'd:/Desktop/2026project/nara'
const E = `${ROOT}/experiments/vocab-corpus-20260728`
const LIMIT = 524288

const name = process.argv[2]
if (!name || name.startsWith('--')) { console.error('usage: vocab-merge-wf-build.mjs <이름> [--only=..] [--out=..] [--model=..]'); process.exit(2) }
const flag = (k) => {
  const a = process.argv.slice(3).find((x) => x.startsWith(`--${k}=`))
  return a ? a.slice(k.length + 3) : null
}
const ONLY = flag('only') ? new Set(flag('only').split(',').map((s) => s.trim()).filter(Boolean)) : null
const MODEL = flag('model')

// ── 규범 슬라이스 ───────────────────────────────────────────────────────────
const spec = fs.readFileSync(`${ROOT}/docs/vocab-corpus-spec.md`, 'utf8').split('\n')
const sliceBetween = (startRe, endRe, label) => {
  const s = spec.findIndex((l) => startRe.test(l))
  if (s < 0) { console.error(`${label} 시작 헤딩을 못 찾았다`); process.exit(1) }
  const e = spec.findIndex((l, i) => i > s && endRe.test(l))
  if (e < 0) { console.error(`${label} 끝 헤딩을 못 찾았다`); process.exit(1) }
  return spec.slice(s, e).join('\n')
}
// §5 대표값 작성 규범 (병합 대표값에도 그대로 적용된다) + §10 병합 규범 전체
const sec5 = sliceBetween(/^## 5\. `senseKo`/, /^## 6\. /, '§5')
const sec10 = sliceBetween(/^## 10\. 4단계 — sense 병합 규범/, /^## 11\. /, '§10')
const NORMS = `${sec5}\n\n${sec10}`
if (NORMS.length < 12000) { console.error(`규범이 너무 짧다: ${NORMS.length}자`); process.exit(1) }

// ── 샤드 목록 ───────────────────────────────────────────────────────────────
// `--shard-dir` 를 주면 그 디렉터리 내용을 목록으로 쓴다(수리 샤드처럼 매니페스트가 따로 있는 경우).
const SHARD_DIR = flag('shard-dir') ?? `${E}/merge/shards`
let ids
if (flag('shard-dir')) {
  ids = fs.readdirSync(SHARD_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
} else {
  const shardsMeta = JSON.parse(fs.readFileSync(`${E}/merge/shards.json`, 'utf8'))
  ids = (shardsMeta.shards ?? shardsMeta).map((s) => (typeof s === 'string' ? s : s.shardId ?? s.id))
}
if (ONLY) {
  const missing = [...ONLY].filter((id) => !ids.includes(id))
  if (missing.length) { console.error(`--only 에 없는 샤드: ${missing.join(', ')}`); process.exit(1) }
  ids = ids.filter((id) => ONLY.has(id))
}
if (!ids.length) { console.error('샤드 목록이 비었다'); process.exit(1) }
const OUT_DIR = flag('out') ?? `${E}/merge/out`

// 샤드별 규모(표제어·후보 수)를 미리 읽어 라벨에 박는다 — 진행 화면에서 난이도가 보인다.
const shardInfo = ids.map((id) => {
  const s = JSON.parse(fs.readFileSync(`${SHARD_DIR}/${id}.json`, "utf8"))
  const items = s.items ?? []
  return {
    id,
    lemmas: items.length,
    cands: items.reduce((a, it) => a + (it.candidates?.length ?? 0), 0),
    label: items.length === 1 ? `${items[0].lemma}|${items[0].pos}` : `${items.length}표제어`,
  }
})

const script = `export const meta = {
  name: 'vocab-merge-${name}',
  description: '4단계 sense 병합 — 샤드 1개당 에이전트 1기 (SPEC §10)',
  phases: [{ title: 'Merge', detail: '배정 샤드 판정 → 산출 Write' }],
}

const ROOT = ${JSON.stringify(ROOT)}
const SHARD_DIR = ${JSON.stringify(SHARD_DIR)}
const OUT_DIR = ${JSON.stringify(OUT_DIR)}
const SHARDS = ${JSON.stringify(shardInfo)}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['shardId', 'lemmaCount', 'clusterCount', 'collapsed', 'blocker'],
  properties: {
    shardId: { type: 'string' },
    lemmaCount: { type: 'integer' },
    clusterCount: { type: 'integer', description: '판정 후 남은 클러스터 총수' },
    collapsed: { type: 'integer', description: '흡수되어 사라진 후보 수 (입력후보 - 클러스터수)' },
    blocker: { type: 'string', description: '못 끝낸 이유. 없으면 "없음".' },
  },
}

// ## §NORMS
const NORMS =
    ${JSON.stringify(NORMS)}

function brief(s) {
  return [
    '너는 기출 영어 단어 코퍼스의 **4단계 sense 병합** 판정 에이전트다.',
    '작업 디렉토리: ' + ROOT,
    '',
    '## 1. 무엇을 하나',
    '같은 표제어(lemma+pos)에 흩어져 있는 **sense 후보들을 의미 단위로 묶는다.**',
    '표현만 다르고 뜻이 같으면 하나로 합치고, 뜻이 다르면 반드시 따로 둔다.',
    '**이 작업의 규범 전문이 이 브리프 맨 끝 §NORMS 에 실려 있다.**',
    '\`docs/vocab-corpus-spec.md\` 를 Read 하지 마라 — 같은 내용이고 토큰만 두 배로 든다.',
    '',
    '## 2. 배정',
    '샤드 ' + s.id + ' — 표제어 ' + s.lemmas + '개 · sense 후보 ' + s.cands + '개.',
    '**입력 파일: ' + SHARD_DIR + '/' + s.id + '.json 을 Read 해라.** 이 하나만 처리한다.',
    '다른 샤드는 건드리지 마라.',
    '',
    '## 3. 판정의 핵심 — 치환 시험 (§10.2)',
    '두 후보가 같은 뜻인지는 **정의문이 비슷한지가 아니라 서로 바꿔 쓸 수 있는지**로 판정한다.',
    '각 후보의 예문에 상대 후보의 뜻을 넣어봐서 문장이 성립하면 같은 sense 다.',
    '- 문자열 유사도·자카드로 판정하지 마라. 그 방식은 이미 실패했다(§10.1).',
    '- 사역/기동(make it hot / it made) · 능동/수동 은 **어떤 경우에도 합치지 않는다.**',
    '- 애매하면 **합치지 말고 나눠라.** 병합은 되돌리기가 비싸다(§10.3).',
    '',
    '## 4. 산출 (§10.5)',
    OUT_DIR + '/' + s.id + '.json 에 **전면 교체**로 Write 한다. 형상을 정확히 지켜라 —',
    '\`results\` 는 **배열**이고 \`observations\` 는 **최상위**다(표제어 안이 아니다).',
    '\`\`\`json',
    '{ "shardId": "' + s.id + '",',
    '  "results": [{',
    '     "lemma": "<표제어>", "pos": "<품사>",',
    '     "clusters": [{',
    '        "senseKo": "대표 한글뜻(공백·물결 제외 1~12자)",',
    '        "senseEn": "대표 영영정의(3단어 이상, 표제어 자신을 쓰지 마라)",',
    '        "memberKeys": ["흡수한 senseKey 전부"],',
    '        "why": "왜 이렇게 묶었는지 — 치환 시험 근거. 비우면 게이트가 막는다",',
    '        "examples": ["멤버 수 이상. 흡수된 멤버의 예문을 버리지 마라"],',
    '        "reviewed": null',
    '     }]',
    '  }],',
    '  "observations": [{ "kind": "<§10.6.3 목록 안에서>", "senseKeys": ["..."], "what": "관찰 내용" }]',
    '}',
    '\`\`\`',
    '',
    '## 5. 기계가 강제하는 것 — 어기면 산출이 반려된다',
    '- **전단사**: 입력 senseKey 는 **빠짐없이 정확히 한 번씩** 어느 클러스터의 memberKeys 에 들어가야 한다.',
    '  입력에 없는 키를 지어내도 같은 검사에서 잡힌다.',
    '- \`examples\` 는 **필수**이고 개수가 **멤버 수 이상**이어야 한다(흡수된 멤버의 근거 보존).',
    '- \`why\` 필수 · \`reviewed\` 필수(null | upheld | split-back) · \`observations\` 필수(없으면 []).',
    '- 같은 lemma|pos 안에서 클러스터의 senseKo 가 서로 겹치면 안 된다.',
    '- senseKo 는 1~12자, senseEn 은 3단어 이상.',
    '',
    '## 6. 다 쓴 뒤',
    '산출 JSON 을 스스로 다시 읽어 **전단사·examples 개수·senseKo 중복**을 눈으로 확인해라.',
    '게이트는 나중에 일괄로 돈다 — 여기서 틀리면 왕복이 비싸다.',
    '',
    '---',
    '',
    '## §NORMS',
    NORMS,
  ].join('\\n')
}

log('4단계 병합 — 샤드 ' + SHARDS.length + '개 발사')
const results = await parallel(
  SHARDS.map((s) => () => agent(brief(s), { label: s.id + ':' + s.label, phase: 'Merge', schema: SCHEMA${MODEL ? `, model: ${JSON.stringify(MODEL)}` : ''} })),
)

const ok = results.filter(Boolean)
const clusters = ok.reduce((a, r) => a + (r.clusterCount ?? 0), 0)
const collapsed = ok.reduce((a, r) => a + (r.collapsed ?? 0), 0)
log('회수 ' + ok.length + '/' + SHARDS.length + ' · 클러스터 ' + clusters + ' · 흡수 ' + collapsed)
const blocked = ok.filter((r) => r.blocker && r.blocker !== '없음')
if (blocked.length) log('막힌 샤드: ' + blocked.map((b) => b.shardId + '(' + b.blocker + ')').join(' · '))

return {
  requested: SHARDS.length,
  recovered: ok.length,
  lost: SHARDS.length - ok.length,
  clusters,
  collapsed,
  blockers: blocked.map((b) => b.shardId),
}
`

const bytes = Buffer.byteLength(script)
const checks = [
  ['샤드 수 일치', (script.match(/"id":/g) ?? []).length === ids.length],
  ['§NORMS 인라인', script.includes('## §NORMS') && NORMS.length > 12000],
  ['치환 시험 조항', script.includes('치환 시험')],
  ['전단사 조항', script.includes('전단사')],
  ['CR 없음', !/\r/.test(script)],
  [`512KB 이하 (${(bytes / 1024).toFixed(0)}KB)`, bytes <= LIMIT],
]
for (const [k, v] of checks) console.log(`${v ? '✓' : '✗'} ${k}`)
if (checks.some((c) => !c[1])) process.exit(1)

const out = `${WF}vocab-merge-${name}.js`
fs.writeFileSync(out, script.replace(/\r/g, ''))
const { execSync } = await import('child_process')
execSync(`node --check "${out}"`)
console.log(`\n작성 ${out.split('/').pop()} · 샤드 ${ids.length} · ${(bytes / 1024).toFixed(0)}KB · 구문 OK`)
console.log(`규범 ${NORMS.length}자 · 후보 총 ${shardInfo.reduce((a, s) => a + s.cands, 0)}개`)
