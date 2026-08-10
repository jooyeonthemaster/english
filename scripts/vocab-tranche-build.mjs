// 기출 단어 코퍼스 — 추출 트랜치 워크플로 조립기
//
// 왜: 잔여 1,900건을 320건 트랜치로 나눠 발사하는데, 매번 임시 스크립트로 조립하면
//     조립 자체가 사고 지점이 된다(실측: 최상위 키 누락·이스케이프 깨짐·512KB 초과 전부 겪었다).
//     이 스크립트가 조립을 한 줄로 만들고, 발사 전 자기점검까지 한다.
//
// 무엇을 하나:
//   ① 검증된 린 브리프 템플릿(vocab-ab-lean.js)을 뼈대로 쓴다 — 브리프 문구를 손으로 다시 쓰지 않는다.
//   ② 스펙은 `vocab-brief-compile.mjs` 로 **그 시점 정본**을 슬라이스해 인라인한다(포크 방지, §13).
//   ③ 견본은 `vocab-exemplar-compile.mjs` 로 **무손실 압축**해 인라인한다(들여쓰기 8.5k자 제거).
//   ④ 지문 데이터는 `vocab-pdata.ts --pending` 산출을 받는다(분리기 동일 경로, §13.5).
//   ⑤ 512KB 한도·CR·필수 블록 존재를 발사 전에 확인하고, 하나라도 어긋나면 종료코드 1.
//
//   npx tsx scripts/vocab-pdata.ts --pending --limit=320 > pd.json
//   node scripts/vocab-tranche-build.mjs <번호> <pd.json>
import fs from 'fs'
import { execSync } from 'child_process'

const WF = 'C:/Users/jooye/.claude/projects/d--Desktop-2026project-nara/652b2631-b720-4406-af94-8b903824aaf1/workflows/scripts/'
const TEMPLATE = `${WF}vocab-ab-lean.js`
const LIMIT = 524288

const n = process.argv[2]
const pdPath = process.argv[3]
if (!n || !pdPath) { console.error('usage: vocab-tranche-build.mjs <번호> <pdata.json>'); process.exit(2) }

const pd = JSON.parse(fs.readFileSync(pdPath, 'utf8'))
const ids = Object.keys(pd)
if (ids.length === 0) { console.error('지문 데이터가 비어 있다'); process.exit(1) }

const spec = execSync('node scripts/vocab-brief-compile.mjs', { maxBuffer: 1 << 26 }).toString()
const exemplar = execSync('node scripts/vocab-exemplar-compile.mjs', { maxBuffer: 1 << 26 }).toString()
if (spec.length < 30000) { console.error(`스펙이 너무 짧다: ${spec.length}자`); process.exit(1) }
if (exemplar.length < 20000) { console.error(`견본이 너무 짧다: ${exemplar.length}자`); process.exit(1) }

const lines = fs.readFileSync(TEMPLATE, 'utf8').split('\n')

// §SPEC / §EXEMPLAR 블록은 마커 **다음 줄**에 JSON 문자열 리터럴로 들어 있다. 그 줄만 갈아끼운다.
const swapAfter = (marker, payload, label) => {
  const i = lines.findIndex((l) => l.includes(marker))
  if (i < 0 || i + 1 >= lines.length) { console.error(`${label} 마커를 못 찾았다`); process.exit(1) }
  lines[i + 1] = `    ${JSON.stringify(payload)},`
}
swapAfter('## §SPEC', spec, '§SPEC')
swapAfter('## §EXEMPLAR', exemplar, '§EXEMPLAR')

let s = lines.join('\n')
const sub = (re, to, label) => {
  const before = s
  s = s.replace(re, to)
  if (s === before) { console.error(`${label} 치환 실패`); process.exit(1) }
}
// §PASSAGE 안내를 **실제 PDATA 모양과 맞춘다.**
// 【실측 2026-07-30】 `vocab-pdata.ts` 에서 `text` 를 뺀(512KB 한도, §13.5) 뒤에도 템플릿 브리프는
//   "원문과 확정 문장 분리 결과가 §PASSAGE 에 있다"로 남아 있었다. 없는 걸 있다고 말하면
//   에이전트는 그걸 찾아 `passages.json` 을 열고, 그 순간 인라인 최적화가 무효가 된다.
sub(
  /    '원문과 \*\*확정 문장 분리 결과\*\*가 아래 §PASSAGE 에 있다\. 스크립트를 돌리지 마라\.',/,
  "    '**확정 문장 분리 결과**가 아래 §PASSAGE 에 있다. 스크립트를 돌리지 마라.',\n" +
    "    '지문 원문은 `sentences[].en` 을 i 순서대로 이어붙인 것이다(별도 text 필드는 없다).',",
  '§PASSAGE 안내문',
)
sub(/const PDATA = \{[\s\S]*?\}\nconst OUT/, `const PDATA = ${JSON.stringify(pd)}\nconst OUT`, 'PDATA')
sub(/const OUT = '[^']*'/, "const OUT = 'experiments/vocab-corpus-20260728/raw'", 'OUT')
sub(/const IDS = \[[\s\S]*?\]\n/, `const IDS = ${JSON.stringify(ids)}\n`, 'IDS')
sub(/name: '[^']*'/, `name: 'vocab-extract-lean-${n}'`, 'meta.name')
s = s.replace(/\r/g, '')

const bytes = Buffer.byteLength(s)
const checks = [
  ['IDS 수 일치', JSON.parse(s.match(/const IDS = (\[.*?\])\n/s)[1]).length === ids.length],
  ['PDATA 키 일치', Object.keys(JSON.parse(s.match(/const PDATA = (\{.*?\})\nconst OUT/s)[1])).length === ids.length],
  ['산출 = raw', /const OUT = 'experiments\/vocab-corpus-20260728\/raw'/.test(s)],
  ['§1.1 도구 금지', s.includes('도구 호출 금지 목록')],
  ['§SPEC·§EXEMPLAR·§PASSAGE', s.includes('## §SPEC') && s.includes('## §EXEMPLAR') && s.includes('## §PASSAGE')],
  ['등급별 지시', s.includes('겨냥하면 안 되는 것')],
  ['CR 없음', !/\r/.test(s)],
  [`512KB 이하 (${(bytes / 1024).toFixed(0)}KB)`, bytes <= LIMIT],
]
for (const [k, v] of checks) console.log(`${v ? '✓' : '✗'} ${k}`)
if (checks.some((c) => !c[1])) process.exit(1)

const out = `${WF}vocab-extract-lean-${n}.js`
fs.writeFileSync(out, s)
// 구문 검증 — 함대를 띄운 뒤 파싱 오류를 발견하면 왕복이 비싸다.
execSync(`node --check "${out}"`)
console.log(`\n작성 ${out.split('/').pop()} · ${ids.length}건 · ${(bytes / 1024).toFixed(0)}KB · 구문 OK`)
console.log(`스펙 ${spec.length}자 · 견본 ${exemplar.length}자(무손실 압축)`)
