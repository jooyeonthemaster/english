// 4단계 병합 — 실패 샤드 재분할기
//
// 왜: 전량 실행 실패 90건의 원인이 **샤드당 후보 수**로 특정됐다(실측 2026-08-03).
//   · 출력 절단 51건 — 산출 JSON 이 상한을 넘어 문장 중간에서 잘렸다
//   · 전단사 위반 39건 — 후보가 많을수록 모델이 키를 놓친다
// 표제어는 서로 독립이므로 **한 샤드에 하나씩** 담으면 후보 수가 1/3~1/12 로 준다.
// 단일 표제어가 이미 거대한 경우(make 152후보)는 더 쪼갤 수 없다 — 그건 max_tokens 상향과
// 모델 폴백으로 따로 다룬다. 여기서는 나눌 수 있는 것만 나누고, 못 나누는 건 그대로 옮긴다.
//
//   node scripts/vocab-merge-reshard.mjs [--out=<dir>] [--per-shard=1]
import fs from 'fs'

const E = 'd:/Desktop/2026project/nara/experiments/vocab-corpus-20260728'
const SRC = `${E}/merge/shards`
const QDIR = `${E}/merge/quarantine`
const flag = (k, d = null) => {
  const a = process.argv.slice(2).find((x) => x.startsWith(`--${k}=`))
  return a ? a.slice(k.length + 3) : d
}
const OUT = flag('out', `${E}/merge/shards-repair`)
const PER = Number(flag('per-shard', '1'))

// 격리 목록이 아니라 **산출 누락**을 기준으로 잡는다. 실측 2026-08-03: 응답이 7.3MB 로 폭주해
// 격리 기록도 남기지 못한 채 러너가 매달린 샤드가 있었다. "무엇이 실패했나"가 아니라
// "무엇이 아직 없나"로 물어야 빠짐이 없다.
const all = fs.readdirSync(SRC).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
const stillFailed = all.filter((id) => !fs.existsSync(`${E}/merge/out/${id}.json`))
const quarantined = fs.existsSync(QDIR)
  ? new Set(fs.readdirSync(QDIR).filter((f) => f.endsWith('.err.txt')).map((f) => f.replace('.err.txt', '')))
  : new Set()
if (!stillFailed.length) { console.log('산출이 빠진 샤드가 없다'); process.exit(0) }
console.log(`전체 ${all.length} · 산출 누락 ${stillFailed.length} (그중 격리기록 있음 ${stillFailed.filter((id) => quarantined.has(id)).length})`)

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

let n = 0, lemmas = 0, cands = 0, unsplittable = 0
const manifest = []
for (const id of stillFailed) {
  const p = `${SRC}/${id}.json`
  if (!fs.existsSync(p)) { console.log(`  ! ${id} 원본 샤드 없음 — 건너뜀`); continue }
  const s = JSON.parse(fs.readFileSync(p, 'utf8'))
  const items = s.items ?? []
  if (items.length === 1) unsplittable++
  for (let i = 0; i < items.length; i += PER) {
    const chunk = items.slice(i, i + PER)
    // 원 샤드 id 를 이름에 남긴다 — 어디서 나왔는지 추적 가능해야 한다.
    const nid = `r${String(n).padStart(4, '0')}`
    fs.writeFileSync(`${OUT}/${nid}.json`, JSON.stringify({ shardId: nid, origin: id, items: chunk }, null, 1))
    manifest.push({ shardId: nid, origin: id, lemmas: chunk.length, cands: chunk.reduce((a, it) => a + it.candidates.length, 0) })
    n++; lemmas += chunk.length; cands += chunk.reduce((a, it) => a + it.candidates.length, 0)
  }
}
fs.writeFileSync(`${OUT}.json`, JSON.stringify({ generated: 'vocab-merge-reshard', shards: manifest }, null, 1))

const sizes = manifest.map((m) => m.cands).sort((a, b) => a - b)
const pct = (q) => sizes[Math.floor(sizes.length * q)] ?? 0
console.log(`재분할 ${n}샤드 · ${lemmas}표제어 · 후보 ${cands}`)
console.log(`  후보/샤드  중앙 ${pct(0.5)} · p90 ${pct(0.9)} · 최대 ${sizes[sizes.length - 1]}`)
console.log(`  더 못 쪼개는 단일표제어 원샤드 ${unsplittable}개 (max_tokens·모델 폴백으로 따로 처리)`)
console.log(`→ ${OUT}/  ·  목록 ${OUT}.json`)
