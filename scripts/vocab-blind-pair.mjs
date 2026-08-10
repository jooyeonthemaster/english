// 기출 단어 코퍼스 — 블라인드 채점용 쌍 생성기
//
// 왜: 프롬프트를 고친 뒤 "좋아졌다"를 스스로 판정하면 그건 검수가 아니라 자기확인이다.
//     채점자가 **어느 쪽이 개정본인지 모르게** 두 산출을 섞어 내보낸다.
//
// 설계:
//   - 지문마다 구/신 산출을 **무작위로 A/B 에 배정**하고, 정답표는 별도 파일로 빼둔다.
//   - 채점자에게 가는 파일에는 모델명·프롬프트 판본·생성시각 같은 단서를 남기지 않는다.
//   - 배정은 **지문 ID 해시**로 결정한다 — 실행할 때마다 바뀌면 재현이 안 되고,
//     Math.random 은 이 런타임에서 금지돼 있다.
//
//   node scripts/vocab-blind-pair.mjs <old디렉터리> <new디렉터리> <출력디렉터리>
import fs from 'fs'
import path from 'path'

const [oldDir, newDir, outDir] = process.argv.slice(2)
if (!oldDir || !newDir || !outDir) {
  console.error('usage: vocab-blind-pair.mjs <old> <new> <out>')
  process.exit(2)
}

/**
 * 지문 → A 자리에 구본을 둘지 여부.
 *
 * 【실측 2026-08-01】 처음엔 ID 해시(`h % 2`)를 썼는데 5건에서 **4:1 로 쏠렸다.**
 *   표본이 작으면 해시는 균형을 보장하지 않는다. 채점자에게 위치 편향(A 를 먼저 읽어 기준으로
 *   삼는 등)이 조금이라도 있으면 그대로 결과에 실린다.
 *   그래서 **정렬 후 교대 배정**으로 바꿨다 — 결정적이라 재현 가능하고 균형이 강제된다.
 *   (교대 규칙 자체는 채점자에게 노출되지 않는다. 채점자는 파일 두 개만 본다.)
 */
const oldGoesToA = (sortedIds) => {
  const m = new Map()
  sortedIds.forEach((id, i) => m.set(id, i % 2 === 0))
  return m
}

/**
 * 판본을 짐작하게 하는 흔적을 지운다 — **허용목록**으로.
 *
 * 【실측 2026-08-01】 원래는 거부목록(`generatedAt`·`model`·`promptVersion` 삭제)이었다.
 *   그 뒤 산출물에 출처 각인(§12.4-b)을 넣자 `briefLabel: "codex-v2"` / `"codex-v3-struct"` 가
 *   짝 파일에 **그대로 실렸다** — 채점자가 파일을 열면 정답이 적혀 있는 상태였다.
 *   발사 직전 확인에서 잡았다.
 *   거부목록은 **새로 생기는 필드를 막지 못한다.** 스키마가 자라면 반드시 다시 샌다.
 *   그래서 채점자에게 가는 문서는 **아래 세 키만으로 재구성**한다.
 */
const KEEP = ['passageId', 'sentences', 'entries']
const strip = (doc) => {
  const d = {}
  for (const k of KEEP) if (k in doc) d[k] = JSON.parse(JSON.stringify(doc[k]))
  return d
}

fs.mkdirSync(outDir, { recursive: true })
const key = {}
const ids = fs
  .readdirSync(newDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -5))
  .filter((id) => fs.existsSync(path.join(oldDir, `${id}.json`)))
  .sort()

const assign = oldGoesToA(ids)

for (const id of ids) {
  const o = strip(JSON.parse(fs.readFileSync(path.join(oldDir, `${id}.json`), 'utf8')))
  const n = strip(JSON.parse(fs.readFileSync(path.join(newDir, `${id}.json`), 'utf8')))
  const oldIsA = assign.get(id)
  fs.writeFileSync(path.join(outDir, `${id}__A.json`), JSON.stringify(oldIsA ? o : n, null, 1))
  fs.writeFileSync(path.join(outDir, `${id}__B.json`), JSON.stringify(oldIsA ? n : o, null, 1))
  key[id] = { A: oldIsA ? 'old' : 'new', B: oldIsA ? 'new' : 'old' }
}

// 정답표는 채점자가 보는 디렉터리 **밖**에 둔다.
// 파일명은 출력 디렉터리에서 파생한다 — 고정 이름으로 두면 두 번째 A/B 가
// 첫 번째 정답표를 **말없이 덮어쓴다**(실측: `struct-pairs` 생성이 앞선 `blind-pairs` 의
// 정답표를 날렸다. 결과를 이미 스펙에 기록해 둔 덕에 유실은 없었지만 운이었다).
const keyPath = path.join(path.dirname(outDir), `${path.basename(outDir)}-key.json`)
fs.writeFileSync(keyPath, JSON.stringify(key, null, 1))

const aOld = Object.values(key).filter((k) => k.A === 'old').length
console.log(`쌍 ${ids.length}건 생성 → ${outDir}`)
console.log(`  A가 구본인 지문 ${aOld}건 / A가 신본인 지문 ${ids.length - aOld}건 (한쪽으로 쏠리면 블라인드가 약해진다)`)
console.log(`  정답표: ${keyPath} (채점 디렉터리 밖)`)
