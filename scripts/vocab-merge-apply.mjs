// 4단계 병합 결과를 표제어 레코드에 반영한다 (LLM 0회, 결정론적)
//
// 왜 필요한가: `build/lemmas.json` 은 **병합 전** sense 후보를 담고 있고, 판정 결과는
// `merge/out/*.json` 에 따로 있다. DB 적재기(`vocab-db-load.ts`)는 lemmas.json 만 먹으므로
// 둘을 합치는 자리가 필요하다. 이 스크립트가 그 자리다.
//
// 무엇을 하나: 클러스터 하나 = 최종 sense 하나. 흡수된 멤버들의 **정량 지표를 올바르게 합산**한다.
//   · occurrences 는 합계
//   · difficultyAvg·trapRate 는 **출현수 가중평균** (단순평균을 쓰면 1회짜리가 100회짜리를 흔든다)
//   · examples·traps 는 좌표 기준 중복 제거 후 전부 보존 (§10.4 흡수 멤버의 근거 보존)
//   · senseKoProvisional 은 판정자가 고른 대표값(cluster.senseKo)으로 교체
//
//   node scripts/vocab-merge-apply.mjs [--out=<path>]
import fs from 'fs'

const E = 'd:/Desktop/2026project/nara/experiments/vocab-corpus-20260728'
const flag = (k, d = null) => {
  const a = process.argv.slice(2).find((x) => x.startsWith(`--${k}=`))
  return a ? a.slice(k.length + 3) : d
}
const OUT = flag('out', `${E}/build/lemmas-merged.json`)

const raw = JSON.parse(fs.readFileSync(`${E}/build/lemmas.json`, 'utf8'))
const lemmas = Array.isArray(raw) ? raw : (raw.lemmas ?? raw.items)
if (!Array.isArray(lemmas)) { console.error('lemmas.json 형상을 못 읽었다'); process.exit(1) }

// ── 판정 결과 수집 ──────────────────────────────────────────────────────────
const judged = new Map() // "lemma|pos" → clusters[]
let shardFiles = 0
for (const f of fs.readdirSync(`${E}/merge/out`).filter((x) => x.endsWith('.json'))) {
  shardFiles++
  const d = JSON.parse(fs.readFileSync(`${E}/merge/out/${f}`, 'utf8'))
  for (const r of d.results ?? []) {
    const k = `${r.lemma}|${r.pos}`
    if (judged.has(k)) { console.error(`중복 판정: ${k} (${f})`); process.exit(1) }
    judged.set(k, r.clusters ?? [])
  }
}
console.log(`판정 파일 ${shardFiles} · 판정된 표제어 ${judged.size}`)

const keyOf = (senseEn) => String(senseEn ?? '').trim().replace(/^to\s+/i, '')
const exKey = (e) => `${e.passageId}#${e.sentenceIndex}#${e.surface}`

let touched = 0, kept = 0, sensesBefore = 0, sensesAfter = 0, dropped = 0
const problems = []

for (const L of lemmas) {
  const key = `${L.lemma}|${L.pos}`
  sensesBefore += L.senses.length
  const clusters = judged.get(key)
  if (!clusters) { kept++; sensesAfter += L.senses.length; continue }

  const byKey = new Map(L.senses.map((s) => [s.senseKey, s]))
  const used = new Set()
  const out = []
  const seenKeys = new Set()

  for (const c of clusters) {
    const members = (c.memberKeys ?? []).map((k) => byKey.get(k)).filter(Boolean)
    if (!members.length) { problems.push(`${key}: 클러스터 "${c.senseKo}" 의 멤버를 하나도 못 찾았다`); continue }
    for (const k of c.memberKeys ?? []) used.add(k)

    const occ = members.reduce((a, m) => a + (m.occurrences ?? 0), 0)
    // 가중평균 — 분모가 0이면(출현수 미상) 단순평균으로 떨어진다.
    const wavg = (pick) => {
      const vals = members.filter((m) => pick(m) != null)
      if (!vals.length) return null
      const w = vals.reduce((a, m) => a + (m.occurrences ?? 0), 0)
      if (!w) return vals.reduce((a, m) => a + pick(m), 0) / vals.length
      return vals.reduce((a, m) => a + pick(m) * (m.occurrences ?? 0), 0) / w
    }

    const koMap = new Map()
    for (const m of members) for (const kc of m.senseKoCandidates ?? []) koMap.set(kc.ko, (koMap.get(kc.ko) ?? 0) + (kc.n ?? 0))
    const trapKinds = {}
    for (const m of members) for (const [k2, v] of Object.entries(m.trapKinds ?? {})) trapKinds[k2] = (trapKinds[k2] ?? 0) + v

    const exSeen = new Set(); const examples = []
    for (const m of members) for (const e of m.examples ?? []) { const k2 = exKey(e); if (!exSeen.has(k2)) { exSeen.add(k2); examples.push(e) } }
    const tSeen = new Set(); const traps = []
    for (const m of members) for (const t of m.traps ?? []) { const k2 = `${t.kind}\u241f${t.note}`; if (!tSeen.has(k2)) { tSeen.add(k2); traps.push(t) } }

    // senseKey 는 표제어 안에서 유일해야 한다(DB 유니크). 충돌하면 첫 멤버 키로 물러선다.
    let sk = keyOf(c.senseEn) || c.memberKeys[0]
    if (seenKeys.has(sk)) sk = c.memberKeys[0]
    if (seenKeys.has(sk)) { problems.push(`${key}: senseKey 충돌 "${sk}"`); continue }
    seenKeys.add(sk)

    out.push({
      senseKey: sk,
      senseEnVariants: [...new Set([c.senseEn, ...members.flatMap((m) => m.senseEnVariants ?? [])].filter(Boolean))],
      senseKoCandidates: [...koMap.entries()].map(([ko, n]) => ({ ko, n })).sort((a, b) => b.n - a.n),
      senseKoProvisional: c.senseKo || members[0].senseKoProvisional,
      occurrences: occ || null,
      tiers: [...new Set(members.flatMap((m) => m.tiers ?? []))],
      difficultyAvg: wavg((m) => m.difficultyAvg),
      trapRate: wavg((m) => m.trapRate),
      trapKinds: Object.keys(trapKinds).length ? trapKinds : null,
      examples,
      traps,
      mergedFrom: c.memberKeys, // 추적성 — 어느 후보들이 접혔는지 남긴다
      mergeWhy: c.why ?? null,
    })
  }

  const orphan = L.senses.filter((s) => !used.has(s.senseKey))
  if (orphan.length) { problems.push(`${key}: 어느 클러스터에도 안 들어간 sense ${orphan.length}개`); dropped += orphan.length }
  if (!out.length) { problems.push(`${key}: 병합 결과가 비었다 — 원본 유지`); kept++; sensesAfter += L.senses.length; continue }

  L.senses = out
  L.senseCount = out.length
  L.needsMergeJudgment = false
  touched++; sensesAfter += out.length
}

console.log(`반영 ${touched} 표제어 · 원본 유지 ${kept} · sense ${sensesBefore.toLocaleString()} → ${sensesAfter.toLocaleString()}`)
if (dropped) console.log(`⚠️ 어느 클러스터에도 안 들어간 sense ${dropped}개`)
if (problems.length) {
  console.log(`⚠️ 문제 ${problems.length}건:`)
  problems.slice(0, 15).forEach((p) => console.log('   ' + p))
}

fs.writeFileSync(OUT, JSON.stringify(Array.isArray(raw) ? lemmas : { ...raw, lemmas }, null, 1))
console.log(`→ ${OUT}`)
process.exit(problems.length ? 1 : 0)
