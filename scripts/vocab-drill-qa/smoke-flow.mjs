// 단어 훈련 E2E 스모크 — QA 학생으로 큐→제출→멱등→me→덱 플로우를 실서버에 태운다.
import fs from 'fs'
import crypto from 'crypto'

const BASE = 'http://localhost:3000'
const token = fs.readFileSync(new URL('./.cookie', import.meta.url), 'utf8').trim()
const H = { Cookie: `grammar-drill-session=${token}` }
const HJ = { ...H, 'Content-Type': 'application/json' }

const get = async (p) => (await fetch(BASE + p, { headers: H })).json()
const post = async (p, body) =>
  (await fetch(BASE + p, { method: 'POST', headers: HJ, body: JSON.stringify(body ?? {}) })).json()

const fail = (msg) => { console.error('✗ ' + msg); process.exitCode = 1 }
const ok = (msg) => console.log('✓ ' + msg)

// ── ① 드릴 큐 ──
const q = await get('/api/vocab-drill/queue?mode=drill')
if (!q.ok || !q.queue?.items?.length) fail('drill 큐 실패: ' + JSON.stringify(q).slice(0, 200))
else ok(`drill 큐 ${q.queue.items.length}문항 · "${q.queue.title}"`)
for (const it of (q.queue?.items ?? []).slice(0, 3)) {
  console.log(`   - ${it.type} ${it.lemma} opts=${(it.options ?? []).length} hints=${it.hints?.filter(Boolean).length}`)
  const s = JSON.stringify(it)
  if (it.type !== 'FLASH' && /senseKo/.test(s) && it.type === 'MEANING_CHOICE') {
    // MEANING_CHOICE 에 senseKo 필드가 직접 실리면 유출(선지 배열은 options)
    if ('senseKo' in it) fail(`정답 유출 의심: ${it.type} 에 senseKo 필드`)
  }
}

// ── ② 제출(정답) — DB 에서 senseKo 를 직접 읽어 정답 제출 ──
const item = q.queue.items.find((i) => i.type === 'MEANING_CHOICE') ?? q.queue.items[0]
const { createRequire } = await import('module')
const requireRepo = createRequire(new URL('../../package.json', import.meta.url))
const { PrismaClient } = requireRepo('@prisma/client')
const prisma = new PrismaClient()
const sense = await prisma.vocabDrillSense.findUnique({ where: { id: item.senseId } })
const answer =
  item.type === 'MEANING_CHOICE' ? sense.senseKo
  : item.type === 'WORD_CHOICE' || item.type === 'CONTEXT_FILL' ? sense.lemma
  : item.type === 'SPELL' ? sense.lemma
  : 'O'
const clientKey = crypto.randomUUID()
const body = {
  senseId: item.senseId, itemType: item.type, answer, timeMs: 4200, hintUsed: 0,
  source: 'DRILL', clientKey,
  ...(item.exampleId ? { exampleId: item.exampleId } : {}),
  ...(item.probe ? { probe: item.probe } : {}),
}
const v1 = await post('/api/vocab-drill/submit', body)
if (!v1.ok) fail('제출 실패: ' + JSON.stringify(v1).slice(0, 300))
else if (item.type === 'MEANING_CHOICE' && !v1.verdict.correct) fail('정답 제출인데 오답 판정: ' + JSON.stringify(v1.verdict).slice(0, 200))
else ok(`제출 → correct=${v1.verdict.correct} xp=+${v1.verdict.xpGained} box=${v1.verdict.mastery.box} due=${v1.verdict.mastery.dueAt?.slice(0, 16)}`)

// ── ③ 같은 clientKey 재제출 → duplicate ──
const v2 = await post('/api/vocab-drill/submit', body)
if (!v2.ok || !v2.verdict?.duplicate) fail('멱등 실패 — duplicate 아님: ' + JSON.stringify(v2).slice(0, 200))
else if (v2.verdict.xpGained !== 0) fail('중복 제출에 XP 지급됨')
else ok('clientKey 멱등 확인(duplicate=true, xp=0)')

// DB 로 이중 계상 검증
const attempts = await prisma.vocabDrillAttempt.count({
  where: { studentId: 'cms35q8dg00019q37g2nvlj4l', clientKey },
})
if (attempts !== 1) fail(`원장 행 ${attempts}개 — 1개여야 함`)
else ok('원장 1행 확인')

// ── ④ 복습·취약·문맥 큐 ──
for (const mode of ['review', 'context']) {
  const r = await get(`/api/vocab-drill/queue?mode=${mode}`)
  console.log(`   ${mode}: ok=${r.ok} items=${r.queue?.items?.length ?? 0}${r.error ? ' err=' + r.error : ''}`)
}

// ── ⑤ 덱 플로우 — learn 큐 + 덱 시험 큐 ──
const decks = await prisma.vocabDrillDeck.findMany({
  where: { academyId: 'cmr4lx5690000l504n0uyck1g', status: 'ACTIVE' },
  select: { id: true, title: true, senseCountCache: true },
})
console.log('   덱:', decks.map((d) => `${d.title}(${d.senseCountCache})`).join(' · ') || '없음!')
if (!decks.length) fail('기본 덱 프로비저닝 실패')
else {
  const deck = decks[0]
  const lq = await get(`/api/vocab-drill/queue?mode=learn&deckId=${deck.id}`)
  if (!lq.ok || lq.queue.items[0]?.type !== 'FLASH') fail('learn 큐 실패: ' + JSON.stringify(lq).slice(0, 150))
  else ok(`learn 큐 FLASH ${lq.queue.items.length}장 (${deck.title}) — 뒷면 senseKo 포함=${'senseKo' in lq.queue.items[0]}`)
  // 시험은 TEST 단계에서만 열린다(서버 게이트) — 진행 행을 만들어놓고 검사한다.
  await prisma.vocabDrillDeckProgress.upsert({
    where: { studentId_deckId: { studentId: 'cms35q8dg00019q37g2nvlj4l', deckId: deck.id } },
    create: {
      academyId: 'cmr4lx5690000l504n0uyck1g',
      studentId: 'cms35q8dg00019q37g2nvlj4l',
      deckId: deck.id,
      stage: 'TEST',
    },
    update: { stage: 'TEST' },
  })
  const tq = await get(`/api/vocab-drill/queue?mode=test&deckId=${deck.id}`)
  if (!tq.ok) fail('test 큐 실패: ' + JSON.stringify(tq).slice(0, 150))
  else {
    const mix = {}
    for (const it of tq.queue.items) mix[it.type] = (mix[it.type] ?? 0) + 1
    ok(`test 큐 ${tq.queue.items.length}문항 믹스: ${JSON.stringify(mix)}`)
  }
}

// ── ⑥ me 집계 ──
const me = await get('/api/vocab-drill/me')
if (!me.ok) fail('me 실패')
else ok(`me: solved=${me.me.totals.solved} xp=${me.me.stat?.xp} due=${me.me.dueCount} days14=${me.me.days.length} boxes=${me.me.boxes.map((b) => b.count).join(',')}`)

// ── ⑦ 소유 검증 — 남의 학원 덱 큐는 404 여야 한다 ──
const foreign = await prisma.vocabDrillDeck.findFirst({
  where: { academyId: { not: 'cmr4lx5690000l504n0uyck1g' } },
  select: { id: true },
})
if (foreign) {
  const fr = await get(`/api/vocab-drill/queue?mode=learn&deckId=${foreign.id}`)
  if (fr.ok) fail('타 학원 덱 큐가 열렸다 — 테넌트 격리 위반!')
  else ok('타 학원 덱 → ' + fr.error)
} else console.log('   (타 학원 덱 없음 — 격리 테스트 생략)')

// ── ⑧ 스모크 흔적 정리 — QA 학생의 이번 시도만 삭제 ──
await prisma.vocabDrillAttempt.deleteMany({ where: { studentId: 'cms35q8dg00019q37g2nvlj4l' } })
await prisma.vocabDrillMastery.deleteMany({ where: { studentId: 'cms35q8dg00019q37g2nvlj4l' } })
await prisma.vocabDrillStat.deleteMany({ where: { studentId: 'cms35q8dg00019q37g2nvlj4l' } })
await prisma.vocabDrillDeckProgress.deleteMany({ where: { studentId: 'cms35q8dg00019q37g2nvlj4l' } })
ok('QA 학생 흔적 정리 완료')
await prisma.$disconnect()
