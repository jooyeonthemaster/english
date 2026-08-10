// 4단계 병합 — 모델 간 판정 대조기
//
// 왜: 병합은 정답이 하나로 정해지지 않는 판정 작업이라 "게이트 통과"만으로는 모델을 못 고른다.
// 같은 샤드를 여러 모델이 판정한 결과를 **분할(partition) 단위로** 비교해야 차이가 보인다.
// 특히 방향이 중요하다 — 더 나누는 쪽 오차는 수용 가능하고(§10.3 "애매하면 나눠라"),
// 더 합치는 쪽 오차는 되돌리기가 비싸다.
//
//   node scripts/vocab-merge-compare.mjs <기준디렉터리> <비교디렉터리...> [--shards=s0014,s0015]
import fs from 'fs'

const E = 'd:/Desktop/2026project/nara/experiments/vocab-corpus-20260728'
const args = process.argv.slice(2)
const dirs = args.filter((a) => !a.startsWith('--'))
if (dirs.length < 2) { console.error('usage: vocab-merge-compare.mjs <base> <other...> [--shards=..]'); process.exit(2) }
const shardFlag = args.find((a) => a.startsWith('--shards='))
const label = (d) => d.split(/[\\/]/).pop()

// 각 디렉터리를 { "lemma|pos": [정렬된 memberKey 집합 문자열들] } 로 정규화한다.
const norm = (dir, ids) => {
  const m = new Map()
  for (const id of ids) {
    const p = `${dir}/${id}.json`
    if (!fs.existsSync(p)) continue
    const d = JSON.parse(fs.readFileSync(p, 'utf8'))
    for (const r of Array.isArray(d.results) ? d.results : []) {
      m.set(`${r.lemma}|${r.pos}`, (r.clusters ?? []).map((c) => [...(c.memberKeys ?? [])].sort().join('\u241f')).sort())
    }
  }
  return m
}

const base = dirs[0]
const ids = shardFlag
  ? shardFlag.slice(9).split(',').map((s) => s.trim())
  : fs.readdirSync(base).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()

// 입력 후보 수 — 압축률 계산용
const inCands = new Map()
for (const id of ids) {
  const p = `${E}/merge/shards/${id}.json`
  if (!fs.existsSync(p)) continue
  for (const it of JSON.parse(fs.readFileSync(p, 'utf8')).items ?? []) inCands.set(`${it.lemma}|${it.pos}`, it.candidates.length)
}

const maps = dirs.map((d) => ({ dir: d, name: label(d), m: norm(d, ids) }))
const B = maps[0]

console.log(`샤드 ${ids.length}개 · 표제어 ${B.m.size}개 · 기준 ${B.name}\n`)
console.log('모델'.padEnd(16), '완전일치'.padStart(10), '클러스터'.padStart(9), '더나눔'.padStart(7), '더합침'.padStart(7), '경계상이'.padStart(9))
console.log('─'.repeat(64))

const baseTotal = [...B.m.values()].reduce((a, v) => a + v.length, 0)
console.log(B.name.padEnd(16), '—'.padStart(10), String(baseTotal).padStart(9), '—'.padStart(7), '—'.padStart(7), '—'.padStart(9))

const riskyRows = []
for (const o of maps.slice(1)) {
  let same = 0, more = 0, less = 0, boundary = 0, total = 0
  for (const [k, bv] of B.m) {
    const ov = o.m.get(k)
    if (!ov) continue
    total++
    const eq = bv.length === ov.length && bv.every((x, i) => x === ov[i])
    if (eq) same++
    else if (ov.length > bv.length) { more++; riskyRows.push([o.name, k, 'split', `${bv.length}→${ov.length}`]) }
    else if (ov.length < bv.length) { less++; riskyRows.push([o.name, k, 'MERGE', `${bv.length}→${ov.length}`]) }
    else { boundary++; riskyRows.push([o.name, k, '경계', `${bv.length}개 동일·조합 상이`]) }
  }
  const oTotal = [...o.m.values()].reduce((a, v) => a + v.length, 0)
  console.log(
    o.name.padEnd(16),
    `${same}/${total} ${((same / Math.max(1, total)) * 100).toFixed(0)}%`.padStart(10),
    String(oTotal).padStart(9), String(more).padStart(7), String(less).padStart(7), String(boundary).padStart(9),
  )
}

if (riskyRows.length) {
  console.log('\n── 불일치 상세 (MERGE = 기준보다 더 합침 = 위험 방향) ──')
  for (const [m, k, kind, note] of riskyRows) {
    console.log(`  ${m.padEnd(14)} ${k.padEnd(26)} ${kind.padEnd(6)} ${note}  (입력후보 ${inCands.get(k) ?? '?'})`)
  }
}

// 기계 정합 — 전단사·예문·senseKo 길이
console.log('\n── 기계 검증 ──')
for (const o of maps) {
  let bij = 0, bad = 0, exBad = 0, koBad = 0, obsBad = 0, files = 0
  for (const id of ids) {
    const p = `${o.dir}/${id}.json`
    if (!fs.existsSync(p)) continue
    files++
    const d = JSON.parse(fs.readFileSync(p, 'utf8'))
    if (!Array.isArray(d.observations)) obsBad++
    for (const r of d.results ?? []) {
      const key = `${r.lemma}|${r.pos}`
      const src = JSON.parse(fs.readFileSync(`${E}/merge/shards/${id}.json`, 'utf8')).items.find((i) => `${i.lemma}|${i.pos}` === key)
      const want = new Set((src?.candidates ?? []).map((c) => c.senseKey))
      const got = (r.clusters ?? []).flatMap((c) => c.memberKeys ?? [])
      for (const c of r.clusters ?? []) {
        if (!Array.isArray(c.examples) || c.examples.length < (c.memberKeys ?? []).length) exBad++
        const kl = (c.senseKo ?? '').replace(/[~\s]/g, '').length
        if (kl === 0 || kl > 12) koBad++
      }
      const ok = got.length === new Set(got).size && [...want].every((k) => got.includes(k)) && got.every((k) => want.has(k))
      ok ? bij++ : bad++
    }
  }
  console.log(`  ${o.name.padEnd(14)} 파일 ${files} · 전단사 ${bij} 위반 ${bad} · 예문부족 ${exBad} · senseKo길이 ${koBad} · observations누락 ${obsBad}`)
}
