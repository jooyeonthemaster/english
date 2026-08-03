// 4단계 병합 산출 — 중복 표제어 항목 병합기 (결정론적, LLM 0회)
//
// 왜: 모델이 한 표제어의 클러스터를 `results` 배열의 **두 항목으로 쪼개** 넣는 경우가 있다.
// 합집합으로 보면 전단사가 성립해서 러너 검사를 통과하지만, 게이트는 표제어별로 보므로
// "절반이 누락"으로 잡는다(실측 2026-08-03: critical 300건이 전부 이것 — 31파일 91표제어).
//
// 판정 내용은 멀쩡하다. 그릇이 쪼개졌을 뿐이라 **클러스터를 이어 붙이면 그대로 복원**된다.
// 다만 이어 붙인 뒤 senseKo 가 겹치면 게이트가 §10.4.2 로 막으므로 그 경우만 보고한다.
//
//   node scripts/vocab-merge-dedupe.mjs [--dir=<out>] [--apply]
import fs from 'fs'

const E = 'd:/Desktop/2026project/nara/experiments/vocab-corpus-20260728'
const flag = (k, d = null) => {
  const a = process.argv.slice(2).find((x) => x.startsWith(`--${k}=`))
  return a ? a.slice(k.length + 3) : d
}
const DIR = flag('dir', `${E}/merge/out`)
const APPLY = process.argv.slice(2).includes('--apply')

let files = 0, changed = 0, mergedLemmas = 0, koClash = 0, moved = 0, mixed = 0
const clashes = []
const SHARDS = `${E}/merge/shards`

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json'))) {
  files++
  const p = `${DIR}/${f}`
  const o = JSON.parse(fs.readFileSync(p, 'utf8'))
  if (!Array.isArray(o.results)) continue

  // 소유권 지도 — senseKey 는 어느 표제어의 것인가. 원본 샤드가 정본이다.
  const own = new Map()
  const sp = `${SHARDS}/${f}`
  if (fs.existsSync(sp)) {
    for (const it of JSON.parse(fs.readFileSync(sp, 'utf8')).items ?? []) {
      for (const c of it.candidates ?? []) own.set(c.senseKey, `${it.lemma}|${it.pos}`)
    }
  }

  const byKey = new Map()
  const order = []
  const put = (k, lemma, pos, cluster) => {
    if (!byKey.has(k)) { byKey.set(k, { lemma, pos, clusters: [] }); order.push(k) }
    if (cluster) byKey.get(k).clusters.push(cluster)
  }

  let localMoved = 0
  for (const r of o.results) {
    const declared = `${r.lemma}|${r.pos}`
    if (!(r.clusters ?? []).length) { /* 빈 껍데기는 버린다 — 클러스터가 실제로 붙으면 다시 생긴다 */ }
    for (const c of r.clusters ?? []) {
      /**
       * 클러스터를 **선언된 표제어가 아니라 멤버가 실제로 속한 표제어**에 붙인다.
       * 실측 2026-08-03(s0738): 모델이 `smooth` 를 빈 항목으로 만들고 그 클러스터 4개를
       * `come with` 밑에 넣었다. 멤버 소유권은 깨끗해서 되돌리는 데 판단이 필요 없다.
       */
      const owners = [...new Set((c.memberKeys ?? []).map((k) => own.get(k)).filter(Boolean))]
      if (owners.length === 1 && owners[0] !== declared) {
        const [lemma, pos] = [owners[0].slice(0, owners[0].lastIndexOf('|')), owners[0].slice(owners[0].lastIndexOf('|') + 1)]
        put(owners[0], lemma, pos, c); localMoved++
      } else {
        if (owners.length > 1) { mixed++; clashes.push(`${f} 클러스터가 여러 표제어에 걸침: ${owners.join(' + ')}`) }
        put(declared, r.lemma, r.pos, c)
      }
    }
  }
  moved += localMoved

  const dupCount = o.results.length - new Set(o.results.map((r) => `${r.lemma}|${r.pos}`)).size
  if (!dupCount && !localMoved) continue // 손댈 게 없다

  mergedLemmas += dupCount
  const merged = order.map((k) => byKey.get(k))

  // §10.4.2 — 같은 표제어 안에서 senseKo 가 겹치면 DB 에서 두 sense 가 한 카드로 뭉갠다.
  for (const r of merged) {
    const kos = r.clusters.map((c) => (c.senseKo ?? '').replace(/[~\s·]/g, ''))
    const dup = kos.filter((x, i) => kos.indexOf(x) !== i)
    if (dup.length) { koClash++; clashes.push(`${f} ${r.lemma}|${r.pos} senseKo 중복: ${[...new Set(dup)].join(', ')}`) }
  }

  changed++
  if (APPLY) fs.writeFileSync(p, JSON.stringify({ ...o, results: merged }, null, 1))
}

console.log(`${APPLY ? '적용' : '점검(dry-run)'} — 파일 ${files} · 손댄 파일 ${changed} · 중복 병합 ${mergedLemmas}개 · 클러스터 재배치 ${moved}개`)
if (mixed) console.log(`⚠️ 여러 표제어에 걸친 클러스터 ${mixed}건 — 자동으로 못 옮긴다`)
if (clashes.length) {
  console.log(`⚠️ 병합 후 senseKo 중복 ${koClash}건 — 사람이 봐야 한다:`)
  clashes.slice(0, 20).forEach((c) => console.log('   ' + c))
} else {
  console.log('병합 후 senseKo 중복 없음')
}
if (!APPLY) console.log('\n실제 적용하려면 --apply')
