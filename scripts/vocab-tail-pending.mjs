// 잔여 지문의 **뒤쪽**을 뽑는다 — 코덱스는 앞(--pending --stratify)에서, 클로드는 뒤에서.
// 둘 다 멱등이라 겹쳐도 낭비일 뿐 오염은 아니다.
import fs from 'fs'
const ROOT = 'd:/Desktop/2026project/nara'
const EXP = `${ROOT}/experiments/vocab-corpus-20260728`
const ALL = JSON.parse(fs.readFileSync(`${ROOT}/src/data/exam-passages/passages.json`, 'utf8'))
const done = new Set(fs.readdirSync(`${EXP}/raw`).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)))
const pending = ALL.filter((p) => !done.has(p.id))

const N = Number(process.argv[2] ?? 120)
// 뒤에서부터 N건. 학년이 한쪽으로 쏠리지 않게 확인만 하고, 순서는 그대로 뒤쪽을 쓴다.
const tail = pending.slice(-N).map((p) => p.id)
const g = {}
for (const id of tail) {
  const p = ALL.find((x) => x.id === id)
  const k = p?.grade ?? '?'
  g[k] = (g[k] ?? 0) + 1
}
console.log(`잔여 ${pending.length}건 · 뒤에서 ${tail.length}건 선정`)
console.log('  학년 분포:', Object.entries(g).map(([k, v]) => `${k} ${v}`).join(' · '))
fs.writeFileSync(`${EXP}/claude-tail.json`, JSON.stringify(tail, null, 1))
console.log(`→ ${EXP}/claude-tail.json`)
