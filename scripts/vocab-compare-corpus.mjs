// 기출 단어 코퍼스 — 두 산출군 대조기 [감독 전용 · 게이트 아님]
//
// 왜: 브리프를 고칠 때마다 "정말 나아졌나"를 손으로 세다가 **네 번** 오판할 뻔했다.
//     그 오판은 전부 같은 모양이었다 — **한쪽만 셌다.**
//     ① 재추출 한 파일에서 `for` 두 개가 사라진 걸 보고 회귀로 읽음 →
//        대칭으로 세니 기능어 함정은 오히려 지문당 1.06→1.28(+21%) 이었다(2026-08-01).
//     같은 브리프를 두 번 돌려도 산출은 흔들린다. 손실이 회귀인지 흔들림인지는
//     **같은 축의 획득**을 나란히 놓아야만 갈린다.
//
// ⚠️ **게이트가 아니다. 추출 브리프에 넣지 마라.** 여기 숫자를 목표로 삼는 순간
//     지표를 겨냥한 산출이 나온다 — §5.1-c·§7.1·§7.2-b·§12 에서 네 번 겪은 실패다.
//     이건 감독이 **채택/기각을 판정**하기 위한 계기다.
//
//   node scripts/vocab-compare-corpus.mjs <A디렉터리> <B디렉터리> [--show=N] [--label-a=..] [--label-b=..]
//     A = 기준(구본·대조군), B = 비교 대상(신본·실험군). 교집합 파일만 대조한다.
import fs from 'fs'
import path from 'path'

const [dirA, dirB] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (!dirA || !dirB) {
  console.error('usage: vocab-compare-corpus.mjs <A디렉터리> <B디렉터리> [--show=N] [--label-a=..] [--label-b=..]')
  process.exit(2)
}
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `=${d}`).split('=').slice(1).join('=')
const SHOW = Number(arg('show', 8))
const LA = arg('label-a', 'A'), LB = arg('label-b', 'B')

const FUNC = new Set(['preposition', 'conjunction', 'adverb', 'pronoun', 'determiner'])
const rd = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }
const slot = (e) => `${e.lemma.toLowerCase()}|${e.pos}`

const inA = new Set(fs.readdirSync(dirA).filter((f) => f.endsWith('.json')))
const files = fs.readdirSync(dirB).filter((f) => f.endsWith('.json') && inA.has(f))
if (!files.length) { console.error('교집합 파일이 없다'); process.exit(2) }

let n = 0
const S = { a: { ent: 0, trap: 0, func: 0, idiom: 0, adv: 0 }, b: { ent: 0, trap: 0, func: 0, idiom: 0, adv: 0 } }
const kind = { a: {}, b: {} }
const mv = { lost: 0, gain: 0, lostFunc: 0, gainFunc: 0 }
const ex = { lost: [], gain: [] }

for (const f of files) {
  const A = rd(path.join(dirA, f)), B = rd(path.join(dirB, f))
  if (!A?.entries || !B?.entries) continue
  n++
  for (const [side, d] of [['a', A], ['b', B]]) {
    S[side].ent += d.entries.length
    for (const e of d.entries) {
      if (e.pos === 'idiom' || e.pos === 'phrasal_verb') S[side].idiom++
      if (e.tier === 'advanced') S[side].adv++
      if (e.trap) kind[side][e.trap.kind] = (kind[side][e.trap.kind] || 0) + 1
    }
  }
  // 함정은 **자리(lemma+pos)** 단위로 본다 — 같은 자리에 함정이 붙었나 떨어졌나가 관심사다.
  const ts = (d) => { const m = new Map(); for (const e of d.entries) if (e.trap) m.set(slot(e), e); return m }
  const ta = ts(A), tb = ts(B)
  S.a.trap += ta.size; S.b.trap += tb.size
  for (const [k, e] of ta) {
    if (FUNC.has(e.pos)) S.a.func++
    if (!tb.has(k)) { mv.lost++; if (FUNC.has(e.pos)) { mv.lostFunc++; if (ex.lost.length < SHOW) ex.lost.push(`${f.replace(/\.json$/, '')} · ${e.lemma}[${e.pos}] "${e.senseKo}" — ${e.trap.note}`) } }
  }
  for (const [k, e] of tb) {
    if (FUNC.has(e.pos)) S.b.func++
    if (!ta.has(k)) { mv.gain++; if (FUNC.has(e.pos)) { mv.gainFunc++; if (ex.gain.length < SHOW) ex.gain.push(`${f.replace(/\.json$/, '')} · ${e.lemma}[${e.pos}] "${e.senseKo}" — ${e.trap.note}`) } }
  }
}

const row = (name, a, b, note = '') => {
  const pa = a / n, pb = b / n
  const d = pa === 0 ? '—' : `${pb >= pa ? '+' : ''}${(((pb - pa) / pa) * 100).toFixed(0)}%`
  console.log(`  ${name.padEnd(22)} ${pa.toFixed(2).padStart(6)}  ${pb.toFixed(2).padStart(6)}   ${d.padStart(6)}  ${note}`)
}

console.log(`대조 ${n}쌍  (${LA} = ${dirA}  /  ${LB} = ${dirB})\n`)
console.log(`  ${'지문당'.padEnd(22)} ${LA.padStart(6)}  ${LB.padStart(6)}`)
row('항목', S.a.ent, S.b.ent)
row('함정 보유 자리', S.a.trap, S.b.trap)
row('  └ 기능어 함정', S.a.func, S.b.func, '← §2.5-① 코퍼스의 핵심')
row('관용·구동사 항목', S.a.idiom, S.b.idiom, '← 수능 패턴')
row('advanced 항목', S.a.adv, S.b.adv)

console.log(`\n함정 이동 — **양방향으로 본다**(한쪽만 세면 흔들림이 회귀로 보인다)`)
const net = (g, l) => `순 ${g - l >= 0 ? '+' : ''}${g - l}`
console.log(`  전체     소멸 ${String(mv.lost).padStart(4)}  ↔  신설 ${String(mv.gain).padStart(4)}   ${net(mv.gain, mv.lost)}`)
console.log(`  기능어   소멸 ${String(mv.lostFunc).padStart(4)}  ↔  신설 ${String(mv.gainFunc).padStart(4)}   ${net(mv.gainFunc, mv.lostFunc)}`)

const kinds = [...new Set([...Object.keys(kind.a), ...Object.keys(kind.b)])].sort()
console.log(`\n함정 kind 분포 (건수)`)
for (const k of kinds) console.log(`  ${k.padEnd(16)} ${String(kind.a[k] ?? 0).padStart(5)}  →  ${String(kind.b[k] ?? 0).padStart(5)}`)

if (SHOW > 0) {
  console.log(`\n── ${LB} 에서 사라진 기능어 함정 (표본) ──`)
  for (const s of ex.lost) console.log('  - ' + s)
  console.log(`\n── ${LB} 에서 새로 잡힌 기능어 함정 (표본) ──`)
  for (const s of ex.gain) console.log('  + ' + s)
  console.log(`\n※ 두 표본을 **나란히 읽어라.** 사라진 쪽만 읽으면 반드시 회귀로 보인다.`)
}
