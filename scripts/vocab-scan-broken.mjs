// 산출 디렉터리에서 **깨진/빈 산출**을 찾아낸다.
//
// 왜: 러너의 멱등 검사가 `[ -f "$OUT/$ID.json" ] && return 0` 이다. 즉 **파일이 있기만 하면
//     완료로 친다.** 실행이 중간에 죽어 껍데기만 남으면 그 지문은 **영원히 재시도되지 않고**
//     총계에는 완료로 잡힌다 — 조용한 영구 결손이다.
//     【실측 2026-08-01】 돌고 있는 추출 스크립트를 편집한 창(18:55~19:01)에
//     `{passageId:...,sentences:[],entries:[]}` (따옴표 없는 73바이트) 2건이 생겼고,
//     둘 다 raw 총계에 완료로 잡혀 있었다.
//
//   node scripts/vocab-scan-broken.mjs <디렉터리> [--delete]
// 기본은 **보고만** 한다. `--delete` 를 줘야 지운다(지우면 다음 러너 회차가 다시 뽑는다).
import fs from 'fs'
import path from 'path'

const dir = process.argv[2]
if (!dir) { console.error('usage: vocab-scan-broken.mjs <디렉터리> [--delete]'); process.exit(2) }
const DEL = process.argv.includes('--delete')

const bad = []
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const p = path.join(dir, f)
  const size = fs.statSync(p).size
  let why = null
  let d = null
  try { d = JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { why = `파싱실패(${String(e.message).slice(0, 40)})` }
  if (!why) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) why = '객체가 아님'
    else if (!Array.isArray(d.sentences) || d.sentences.length === 0) why = 'sentences 비었음'
    else if (!Array.isArray(d.entries) || d.entries.length === 0) why = 'entries 비었음'
  }
  if (why) bad.push({ f, size, why, t: fs.statSync(p).mtimeMs })
}
bad.sort((a, b) => a.t - b.t)
console.log(`${dir} — 검사 ${fs.readdirSync(dir).filter((x) => x.endsWith('.json')).length}건 · 결손 ${bad.length}건`)
for (const b of bad) console.log(`  ${new Date(b.t).toLocaleString('ko-KR')}  ${String(b.size).padStart(7)}B  ${b.why.padEnd(28)} ${b.f}`)
if (!bad.length) { console.log('  (없음)'); process.exit(0) }
if (DEL) {
  for (const b of bad) fs.unlinkSync(path.join(dir, b.f))
  console.log(`\n→ ${bad.length}건 삭제했다. 다음 러너 회차가 다시 뽑는다.`)
} else {
  console.log(`\n→ 지우려면 --delete. 지워야 러너가 다시 뽑는다(멱등 검사가 파일 존재만 본다).`)
}
