// 무인 하네스용 배치 선정기 — 그 시점 잔여에서 N건을 뽑아 ids JSON 으로 쓴다.
//
// `vocab-tail-pending.mjs` 와 역할이 겹치지만 일부러 분리했다: 그쪽은 대화형 트랜치가 쓰는
// 검증된 경로이고 `claude-tail.json` 이라는 고정 파일에 쓴다. 무인 루프가 같은 파일을 덮으면
// 진행 중 트랜치의 인플라이트 목록이 사라진다. 여기서는 출력 경로와 제외 목록을 인자로 받는다.
//
//   node scripts/vocab-next-batch.mjs <N> <out.json> [제외파일.json ...]
//
// 제외파일은 ID 배열 JSON 또는 줄바꿈 구분 텍스트 둘 다 받는다(격리 반복 실패 목록이 후자다).
// 잔여의 **뒤쪽**에서 뽑는다 — 코덱스 레인이 앞에서 뽑던 관례를 그대로 지킨다(겹쳐도 멱등).
import fs from 'fs'
import path from 'path'

const ROOT = 'd:/Desktop/2026project/nara'
const EXP = `${ROOT}/experiments/vocab-corpus-20260728`

const N = Number(process.argv[2] ?? 40)
const outPath = process.argv[3]
const excludeFiles = process.argv.slice(4)
if (!outPath) {
  console.error('usage: vocab-next-batch.mjs <N> <out.json> [exclude.json ...]')
  process.exit(2)
}

const ALL = JSON.parse(fs.readFileSync(`${ROOT}/src/data/exam-passages/passages.json`, 'utf8'))
const done = new Set(
  fs.readdirSync(`${EXP}/raw`).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)),
)

const excluded = new Set()
for (const f of excludeFiles) {
  if (!fs.existsSync(f)) continue
  const txt = fs.readFileSync(f, 'utf8').trim()
  if (!txt) continue
  let ids
  try {
    ids = JSON.parse(txt)
  } catch {
    ids = txt.split('\n')
  }
  for (const id of ids) {
    const s = String(id).trim()
    if (s) excluded.add(s)
  }
}

const pending = ALL.filter((p) => !done.has(p.id) && !excluded.has(p.id))
const batch = pending.slice(-N).map((p) => p.id)

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(batch, null, 1))

// 호출자(셸)가 파싱하는 한 줄. 형식을 바꾸지 마라.
console.log(`PENDING ${pending.length} BATCH ${batch.length} DONE ${done.size} EXCLUDED ${excluded.size}`)
