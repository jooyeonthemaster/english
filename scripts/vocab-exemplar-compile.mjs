// 기출 단어 코퍼스 — 견본 압축기
//
// 왜: 린 브리프의 정적 프리픽스는 스펙 34.6k자 + **견본 36.7k자** 다. 견본이 스펙보다 크다.
//     이 프리픽스는 에이전트 루프의 매 턴마다 입력으로 재과금되므로 곧 처리량이다(§13.1).
//     실측: 견본 36,722자 중 **8,639자가 pretty-print 들여쓰기** — 정보가 0인 순수 낭비다.
//
// 두 가지를 분리한다:
//   ① 무손실 압축(기본)  — 항목 1개 = 1줄. 들여쓰기만 걷어내고 내용은 한 글자도 안 건드린다.
//   ② 커버리지 축약(--trim) — pos·tier·trap.kind 를 전부 덮는 최소 부분집합만 남긴다.
//      **정보 손실이 있으므로 반드시 A/B 로 검증한 뒤에만 쓴다**(§13.4 3갈래 원칙).
//
//   node scripts/vocab-exemplar-compile.mjs [--trim] [--stats]
import fs from 'fs'
import path from 'path'

const SRC = path.join(process.cwd(), 'experiments/vocab-corpus-20260728/exemplar/ebsi_go3_20260324-q31.json')
const doc = JSON.parse(fs.readFileSync(SRC, 'utf8'))
const original = fs.readFileSync(SRC, 'utf8').length

let entries = doc.entries

if (process.argv.includes('--trim')) {
  // 커버리지 그리디 — 아직 안 덮인 (pos|tier|trapKind) 축을 가장 많이 새로 덮는 항목을 고른다.
  // 축을 다 덮은 뒤에는 멈춘다. 밀도는 견본이 아니라 §4.2 수치가 정하므로 개수는 중요하지 않다.
  const axes = (e) => [`pos:${e.pos}`, `tier:${e.tier}`, `trap:${e.trap ? e.trap.kind : 'null'}`]
  const need = new Set(entries.flatMap(axes))
  const picked = []
  const covered = new Set()
  while (covered.size < need.size) {
    let best = null
    let bestGain = -1
    for (const e of entries) {
      if (picked.includes(e)) continue
      const gain = axes(e).filter((a) => !covered.has(a)).length
      if (gain > bestGain) { bestGain = gain; best = e }
    }
    if (!best || bestGain === 0) break
    picked.push(best)
    for (const a of axes(best)) covered.add(a)
  }
  if (covered.size !== need.size) {
    process.stderr.write(`⚠️ 축 커버 실패: ${[...need].filter((a) => !covered.has(a)).join(', ')}\n`)
    process.exit(1)
  }

  // 축만 덮으면 **함정 절제 신호가 뒤집힌다.**
  // 【실측 2026-07-30】 그리디가 고른 9항목 중 `trap:null` 이 3개(33%)뿐이었다.
  //   원본은 32/52(62%)가 null 이다 — §7.1 "함정 없음이 기본값"을 견본이 몸으로 보여주는 부분이다.
  //   33% 견본을 주면 에이전트는 "대부분 함정을 단다"로 읽고 가짜 함정을 만든다(§7.2 실패 유형).
  //   그래서 축 커버 뒤에 null 항목을 채워 **원본 비율까지 복원**한다.
  const nullRatio = doc.entries.filter((e) => !e.trap).length / doc.entries.length
  const pool = doc.entries.filter((e) => !e.trap && !picked.includes(e))
  while (pool.length && picked.filter((e) => !e.trap).length / picked.length < nullRatio) {
    picked.push(pool.shift())
  }

  // 원문 순서를 유지한다 — 문장 순서대로 읽히는 게 문체 전달에 유리하다.
  entries = doc.entries.filter((e) => picked.includes(e))
}

// 항목 1개 = 1줄. 사람이 읽을 수 있고 들여쓰기 낭비가 없다.
//
// ⚠️ 최상위 키를 **하드코딩하지 마라.** 처음엔 passageId/sentences/entries 세 개만 적었다가
//    `specVersion` 을 조용히 떨어뜨렸다(무손실 검증이 잡았다). 키가 추가돼도 안 잃도록 일반화한다.
const out =
  '{' +
  Object.entries(doc)
    .map(([k, v]) => {
      const val = k === 'entries' ? entries : v
      return Array.isArray(val)
        ? `${JSON.stringify(k)}:[\n${val.map((x) => JSON.stringify(x)).join(',\n')}\n]`
        : `${JSON.stringify(k)}:${JSON.stringify(val)}`
    })
    .join(',\n') +
  '}'

if (process.argv.includes('--stats')) {
  const axes = (e) => [`pos:${e.pos}`, `tier:${e.tier}`, `trap:${e.trap ? e.trap.kind : 'null'}`]
  const cov = new Set(entries.flatMap(axes))
  const full = new Set(doc.entries.flatMap(axes))
  process.stderr.write(
    `견본 ${original}자 → ${out.length}자 (${((out.length / original) * 100).toFixed(1)}%) · ` +
      `항목 ${doc.entries.length}→${entries.length} · 축 커버 ${cov.size}/${full.size}\n`,
  )
}

process.stdout.write(out)
