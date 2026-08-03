// 전량 스윕 대상 목록 — **낡은 브리프로 뽑힌 산출**을 briefHash 로 골라낸다 (SPEC §12.6).
//
// 왜 briefHash 인가: 파일 mtime 으로 "낡음"을 추정하다 오늘 두 번 틀렸다(§12.4·§12.5).
//   mtime 은 그 뒤 어떤 교체·편집에도 움직이고, 균등 분위 같은 편의 구간은 개정 경계를 가로지른다.
//   산출물이 자기 출처를 들고 있으면 추정이 필요 없다.
//
// 현행 해시 판정: 기본은 **추출 스크립트의 프롬프트 템플릿에서 직접 계산**한다.
//   파일들의 최빈값으로 정하면, 스윕이 절반 돌다 멈췄을 때 "낡은 쪽이 다수"라 기준이 뒤집힌다.
//   기준은 **코드**에 있어야지 데이터에 있으면 안 된다.
//
//   node scripts/vocab-stale-list.mjs [--out=<파일>] [--expect=<해시>] [--limit=N] [--dry]
import fs from 'fs'
import path from 'path'

const ROOT = 'd:/Desktop/2026project/nara'
const EXP = `${ROOT}/experiments/vocab-corpus-20260728`
const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`))
  return a ? a.slice(k.length + 3) : d
}

// ⚠️ **해시를 여기서 계산하지 않는다.**
// 【실측 2026-08-01】 heredoc 본문을 잘라 Node 로 sha1 했더니 `6c19a2073f83` 이 나왔는데
//   실제 각인은 `318140cb7b63` 이었다(셸 `read -r -d ""` 의 종단 처리가 다르다).
//   기준 해시가 틀리면 **전량이 낡음으로 잡히거나 아무것도 안 잡힌다** — 조용한 대형 오판이다.
//   → 기준값은 각인과 **같은 코드 경로**(`scripts/vocab-brief-hash.sh`)로만 만들고,
//     이 스크립트는 그 값을 **받기만** 한다. 추측하지 않는다.
const expect = arg('expect', null)
if (!expect) {
  console.error('현행 브리프 해시가 필요하다. 다음으로 구해서 넘겨라:')
  console.error('  node scripts/vocab-stale-list.mjs --expect="$(bash scripts/vocab-brief-hash.sh)"')
  process.exit(2)
}

// 이미 스테이징된 것은 제외한다(중복 발사 방지 — 멱등이지만 시간 낭비다)
const staged = new Set(
  fs.existsSync(`${EXP}/reextract-stage`)
    ? fs.readdirSync(`${EXP}/reextract-stage`).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
    : [],
)

const rows = []
const byHash = new Map()
for (const f of fs.readdirSync(`${EXP}/raw`).filter((x) => x.endsWith('.json'))) {
  const id = f.replace(/\.json$/, '')
  let d
  try { d = JSON.parse(fs.readFileSync(path.join(`${EXP}/raw`, f), 'utf8')) } catch { continue }
  const h = d.briefHash ?? '(각인없음)'
  byHash.set(h, (byHash.get(h) ?? 0) + 1)
  if (h === expect) continue
  if (staged.has(id)) continue
  // 함정이 적은 것부터 = 개선 여지가 큰 것부터. 중간에 끊겨도 값이 큰 쪽이 먼저 고쳐진다.
  rows.push({ id, traps: (d.entries ?? []).filter((e) => e.trap).length, ent: (d.entries ?? []).length })
}
rows.sort((a, b) => a.traps / Math.max(1, a.ent) - b.traps / Math.max(1, b.ent))

const limit = Number(arg('limit', 0))
const list = (limit > 0 ? rows.slice(0, limit) : rows).map((r) => r.id)

console.log(`현행 브리프 해시: ${expect}`)
console.log('raw 각인 분포:')
for (const [h, n] of [...byHash].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${h}${h === expect ? '  ← 현행' : '  ← 낡음'}`)
}
// 온전성 검사 — 기준 해시가 산출물 어디에도 없으면 **기준이 틀렸을 가능성**을 먼저 의심한다.
// (브리프를 막 바꾼 직후에는 0건이 정상이므로 차단하지 않고 경고만 한다.)
if (!byHash.has(expect)) {
  console.log(`\n⚠️ 기준 해시 ${expect} 가 raw 어디에도 없다 → **전량이 스윕 대상으로 잡힌다.**`)
  console.log(`   브리프를 방금 바꿨다면 정상이다. 아니라면 기준 해시가 틀린 것이다 —`)
  console.log(`   \`bash scripts/vocab-brief-hash.sh\` 로 다시 구하고, 최근 산출의 briefHash 와 맞는지 확인하라.`)
}
console.log(`\n스윕 대상 ${list.length}건 (스테이징 중 ${staged.size}건 제외)`)
if (rows.length) {
  const q = (i) => rows[Math.min(rows.length - 1, Math.floor(rows.length * i))]
  console.log(`  함정밀도 정렬 — 앞 ${q(0).traps}/${q(0).ent} · 중간 ${q(0.5).traps}/${q(0.5).ent} · 뒤 ${q(0.99).traps}/${q(0.99).ent}`)
}

const out = arg('out', `${EXP}/sweep-ids.json`)
if (process.argv.includes('--dry')) { console.log('\n(--dry — 파일을 쓰지 않았다)'); process.exit(0) }
fs.writeFileSync(out, JSON.stringify(list, null, 1))
console.log(`→ ${out}`)
