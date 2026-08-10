// 단어 훈련 — 적대검수 수정분 검증 스모크(보안 계약 중심).
import fs from 'fs'
import crypto from 'crypto'
import { createRequire } from 'module'

const BASE = 'http://localhost:3000'
const SID = 'cms35q8dg00019q37g2nvlj4l'
const AID = 'cmr4lx5690000l504n0uyck1g'
const token = fs.readFileSync(new URL('./.cookie', import.meta.url), 'utf8').trim()
const H = { Cookie: `grammar-drill-session=${token}` }
const HJ = { ...H, 'Content-Type': 'application/json' }
const requireRepo = createRequire(new URL('../../package.json', import.meta.url))
const { PrismaClient } = requireRepo('@prisma/client')
const prisma = new PrismaClient()

const raw = async (p) => fetch(BASE + p, { headers: H })
const get = async (p) => (await raw(p)).json()
const post = async (p, b) =>
  (await fetch(BASE + p, { method: 'POST', headers: HJ, body: JSON.stringify(b ?? {}) })).json()

let bad = 0
const fail = (m) => { console.error('✗ ' + m); bad++ }
const ok = (m) => console.log('✓ ' + m)

// ── ① 정답 유출: 표제어를 묻는 유형에 lemma 가 없어야 한다 ──
const q = await get('/api/vocab-drill/queue?mode=drill')
const leaky = (q.queue?.items ?? []).filter(
  (i) => ['WORD_CHOICE', 'CONTEXT_FILL', 'SPELL'].includes(i.type) && 'lemma' in i,
)
if (leaky.length) fail(`정답 유출: ${leaky.map((i) => i.type).join(',')} 에 lemma 필드`)
else ok('lemma 유출 없음(표제어를 묻는 유형)')

// 힌트에 정답 문자열이 박혀 있는지
for (const it of q.queue?.items ?? []) {
  const s = await prisma.vocabDrillSense.findUnique({ where: { id: it.senseId } })
  const hints = (it.hints ?? []).join(' ')
  if (['WORD_CHOICE', 'CONTEXT_FILL', 'SPELL'].includes(it.type) && hints.includes(s.lemma)) {
    fail(`${it.type} 힌트에 정답 표제어 "${s.lemma}"`)
  }
  if (it.type === 'MEANING_CHOICE' && hints.includes(s.senseKo)) {
    fail(`MEANING_CHOICE 힌트에 정답 뜻 "${s.senseKo}"`)
  }
}
ok('힌트에 정답 문자열 없음')

// ── ② sense 오라클 봉인: 안 푼 단어는 403 ──
const unseen = q.queue.items[0].senseId
const r403 = await raw(`/api/vocab-drill/sense/${unseen}`)
if (r403.status !== 403) fail(`미학습 sense 가 ${r403.status} — 403 이어야 한다(정답 오라클)`)
else ok('미학습 sense → 403 NOT_STUDIED')

// ── ③ probe 암호화: base64 로 정답이 안 보여야 한다 ──
let trap = null
for (let i = 0; i < 6 && !trap; i++) {
  const tq = await get('/api/vocab-drill/queue?mode=weak')
  trap = (tq.queue?.items ?? []).find((x) => x.type === 'TRAP_JUDGE')
  if (!trap) {
    const dq = await get('/api/vocab-drill/queue?mode=drill')
    trap = (dq.queue?.items ?? []).find((x) => x.type === 'TRAP_JUDGE')
  }
}
if (trap) {
  const head = trap.probe.split('.')[0]
  if (head !== 'v2') fail('probe 버전 태그가 v2 가 아니다 — 구 평문 토큰?')
  const joined = trap.probe
  let decoded = ''
  try { decoded = Buffer.from(joined.split('.')[3] ?? '', 'base64url').toString('utf8') } catch {}
  if (decoded.includes('senseId') || decoded.includes(trap.senseId)) {
    fail('probe 가 평문으로 읽힌다 — 암호화 실패')
  } else ok('probe 암호화 확인(base64 디코딩으로 정답 안 보임)')
} else console.log('   (TRAP_JUDGE 미출제 — probe 검사 생략)')

// ── ④ 덱 단계 게이트: LEARN 단계에서 시험 큐가 안 나와야 한다 ──
const deck = await prisma.vocabDrillDeck.findFirst({
  where: { academyId: AID, status: 'ACTIVE' },
  select: { id: true, title: true },
})
await prisma.vocabDrillDeckProgress.deleteMany({ where: { studentId: SID, deckId: deck.id } })
const tq = await get(`/api/vocab-drill/queue?mode=test&deckId=${deck.id}`)
if (tq.ok) fail('LEARN 단계인데 시험 큐가 발급됐다 — 단계 게이트 실패')
else ok(`단계 게이트: LEARN 에서 test 큐 거부(${tq.error})`)

// ── ⑤ FLASH 위조로 덱 시험 100점 자가부여 시도 ──
const senses = await prisma.vocabDrillSense.findMany({ where: { retiredAt: null }, take: 12 })
for (const s of senses) {
  await post('/api/vocab-drill/submit', {
    senseId: s.id, itemType: 'FLASH', answer: 'O', timeMs: 100, hintUsed: 0,
    source: 'DECK_TEST', deckId: deck.id, clientKey: crypto.randomUUID(),
  })
}
const forged = await post(`/api/vocab-drill/deck/${deck.id}/complete-test`)
if (forged.ok && forged.passed) fail('FLASH 위조로 덱 MASTERED 자가부여 성공 — 봉인 실패!')
else ok(`FLASH 위조 차단(${forged.error ?? `passed=${forged.passed}`})`)
const prog = await prisma.vocabDrillDeckProgress.findUnique({
  where: { studentId_deckId: { studentId: SID, deckId: deck.id } },
})
if (prog?.stage === 'MASTERED') fail('진행 행이 MASTERED 로 올라갔다')
else ok(`덱 단계 = ${prog?.stage ?? '(없음)'}`)

// ── ⑥ 남의 학원 덱으로 제출 시도 ──
const other = await prisma.vocabDrillDeck.findFirst({ where: { academyId: { not: AID } }, select: { id: true } })
if (other) {
  const res = await post('/api/vocab-drill/submit', {
    senseId: senses[0].id, itemType: 'MEANING_CHOICE', answer: 'x', timeMs: 100,
    hintUsed: 0, source: 'DRILL', deckId: other.id, clientKey: crypto.randomUUID(),
  })
  if (res.ok) fail('타 학원 덱으로 제출이 통과됐다 — 테넌트 격리 실패')
  else ok('타 학원 덱 제출 차단')
} else console.log('   (타 학원 덱 없음)')

// ── ⑦ 빈 큐 계약: 복습 없음이 404 가 아니라 ok:true·items:[] ──
await prisma.vocabDrillMastery.deleteMany({ where: { studentId: SID } })
const wq = await get('/api/vocab-drill/queue?mode=weak')
if (!wq.ok) fail(`취약 없음이 오류로 내려온다(${wq.error}) — ok:true·items:[] 이어야 한다`)
else if (wq.queue.items.length !== 0) fail('취약 큐가 비어 있지 않다')
else ok('빈 큐 계약: ok:true · items:[] · title="' + wq.queue.title + '"')

// ── ⑧ 존재하지 않는 덱은 여전히 404 ──
const nf = await get('/api/vocab-drill/queue?mode=learn&deckId=nonexistent-deck-id')
if (nf.ok) fail('없는 덱이 통과됐다')
else ok('없는 덱 → ' + nf.error)

// ── 정리 ──
await prisma.vocabDrillAttempt.deleteMany({ where: { studentId: SID } })
await prisma.vocabDrillMastery.deleteMany({ where: { studentId: SID } })
await prisma.vocabDrillStat.deleteMany({ where: { studentId: SID } })
await prisma.vocabDrillDeckProgress.deleteMany({ where: { studentId: SID } })
ok('QA 흔적 정리')
await prisma.$disconnect()
console.log(bad ? `\n실패 ${bad}건` : '\n전부 통과')
process.exitCode = bad ? 1 : 0
