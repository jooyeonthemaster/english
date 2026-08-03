// 기출 단어 코퍼스 — 도달점 시험(§7.2-ii) 실패 후보 감사기 [감독 전용]
//
// 왜: 블라인드 채점에서 살아남은 결함이 **가짜 함정**이었고, 그중 지배적 유형이
//     "오독한 한국어와 senseKo 가 같은 말에 도달"하는 것이었다.
//     예: `cleaning an infected finger` 에서 '청소하다' vs '씻다' — 목적어가 이미 뜻을 확정한다.
//     학생이 오독해도 놓치는 것이 없으면 그것은 함정이 아니다.
//
// ⚠️ **이 스크립트는 게이트가 아니다. 추출 프롬프트에 넣지 마라.**
//     휴리스틱이라 오탐이 있고, 차단성으로 두면 "지표를 겨냥한 산출"이 나온다 —
//     이 프로젝트가 §5.1-c·§7.1·§7.2-b 에서 이미 세 번 겪은 실패다(SPEC §12).
//     감독이 **후보를 좁혀 눈으로 판정**하는 용도다(pilsalgi: feed-the-machine-report).
//
//   node scripts/vocab-audit-destination.mjs <raw디렉터리> [--since=ISO] [--show=N]
import fs from 'fs'
import path from 'path'

const dir = process.argv[2]
if (!dir) { console.error('usage: vocab-audit-destination.mjs <dir> [--since=ISO] [--show=N]'); process.exit(2) }
const since = (process.argv.find((a) => a.startsWith('--since=')) || '').split('=')[1]
const show = Number((process.argv.find((a) => a.startsWith('--show=')) || '=20').split('=')[1])

/** trap.note 에서 오독어 X 를 뽑는다 — "학생이 X 로 읽어…" 의 X. (게이트와 같은 방식) */
function extractMisreading(note) {
  const m = String(note).match(/^(.*?)(?:으로|로)\s*(?:읽|이해|해석|받아들|착각|보아|봐)/u)
  if (!m) return null
  const seg = m[1]
  const quoted = [...seg.matchAll(/['‘"“]([^'’"”]{1,20})['’"”]/gu)]
  if (quoted.length) return quoted[quoted.length - 1][1]
  return (
    seg.replace(/^학생이\s*/u, '')
      .replace(/^[A-Za-z][A-Za-z\s'-]*[을를은는이가]\s*/u, '')
      .replace(/\s*(뜻|의미|것)$/u, '')
      .trim() || null
  )
}

/** 한국어 어간 근사 — 활용어미를 떼어 '씻다/씻어/씻는'을 한 덩어리로 본다. */
const stem = (s) =>
  String(s).replace(/[~\s·'"’”‘“]/gu, '')
    .replace(/(하다|되다|이다|시키다|드리다|당하다)$/u, '')
    .replace(/(었다|았다|는다|ㄴ다|다|기|음|함)$/u, '')

/**
 * 도달점이 같아 보이는가 — 세 가지 신호 중 하나라도 걸리면 **후보**로 올린다.
 *   ① 어간이 서로 포함관계 (씻 ⊂ 씻어내)
 *   ② 어간이 완전히 동일
 *   ③ 두 글자 이상 겹치는 접두부 (청소 vs 청결 은 아님 — 접두 2자 동일이어야)
 * 오탐이 나오는 게 정상이다. 감독이 실물을 보고 판정한다.
 */
function sameDestination(mis, ko) {
  const a = stem(mis), b = stem(ko)
  if (!a || !b) return null
  if (a === b) return '어간동일'
  // 【음성테스트에서 잡음 2026-08-01】 처음엔 `length >= 2` 를 걸고 **부분문자열 포함**을 봤는데
  //   `씻다`(어간 '씻')처럼 **1음절 어간**이 길이 조건에 걸려 `씻어내다` 와의 관계를 놓쳤다.
  //   한국어 용언 어간은 1음절이 흔하다(씻·놓·잡·쓰). 그리고 임의 포함은 잡음이 크므로
  //   **접두관계**(한쪽이 다른 쪽으로 시작)로 좁힌다 — 활용·파생은 어간 뒤에 붙기 때문이다.
  if (a.startsWith(b) || b.startsWith(a)) return '어간 접두관계'
  if (a.length >= 2 && b.length >= 2 && a.slice(0, 2) === b.slice(0, 2)) return '접두 2자 동일'
  return null
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  .filter((f) => !since || fs.statSync(path.join(dir, f)).mtimeMs >= Date.parse(since))

let traps = 0, noMis = 0
const hits = []
for (const f of files) {
  let d
  try { d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) } catch { continue }
  for (const e of d.entries ?? []) {
    if (!e.trap) continue
    traps++
    const mis = extractMisreading(e.trap.note)
    if (!mis) { noMis++; continue }
    const why = sameDestination(mis, e.senseKo)
    if (why) hits.push({ id: d.passageId, lemma: e.lemma, surface: e.surface, ko: e.senseKo, mis, why, note: e.trap.note, kind: e.trap.kind })
  }
}

console.log(`대상 ${files.length}파일 · 함정 ${traps}건 (오독어 추출 실패 ${noMis}건은 판정 대상 밖)`)
console.log(`도달점 의심 ${hits.length}건 (함정의 ${((hits.length / Math.max(1, traps - noMis)) * 100).toFixed(1)}%)`)
const byWhy = {}
for (const h of hits) byWhy[h.why] = (byWhy[h.why] || 0) + 1
console.log('  신호별:', Object.entries(byWhy).map(([k, v]) => `${k} ${v}`).join(' · '))
console.log('')
for (const h of hits.slice(0, show)) {
  console.log(`[${h.why}] ${h.lemma} (${h.kind}) — senseKo "${h.ko}" vs 오독 "${h.mis}"`)
  console.log(`   ${h.note}`)
}
