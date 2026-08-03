// 4단계 sense 병합 — OpenRouter 러너 (Claude 구독 쿼터를 안 쓴다)
//
// 왜 API 인가: 병합은 표제어 단위로 **완전히 독립**이라 순수 팬아웃이다. Claude Code 는 동시
// 16기가 상한(CPU 코어)인데 API 는 그 제약이 없다. 1,528 샤드를 15~20시간 대신 1~2시간에 끝낸다.
// 전역 정합이 필요한 senseId 부여는 판정이 끝난 뒤 코드가 결정론적으로 돌린다.
//
// ⚠️ 스키마는 **json_schema strict** 로 강제한다. `json_object` 로 두면 모델이 키를 자유 작명해
//    산출이 통째로 못 쓰게 된다(2026-07 복원 장애의 원인이 정확히 이것이었다).
//
// ⚠️ 규범을 **프롬프트 맨 앞**에 둔다. 1,528 샤드가 같은 접두사를 공유하므로 프롬프트 캐시가
//    먹으면 반복 입력분이 거의 공짜가 된다.
//
//   node scripts/vocab-merge-openrouter.mjs --model=openai/gpt-5.6-luna \
//     [--only=s0014,s0015] [--out=<dir>] [--concurrency=20] [--effort=high] [--max-variants=N] [--dry]
import fs from 'fs'
import path from 'path'

const ROOT = 'd:/Desktop/2026project/nara'
const E = `${ROOT}/experiments/vocab-corpus-20260728`
const SHARD_DIR_DEFAULT = `${E}/merge/shards`

const flag = (k, dflt = null) => {
  const a = process.argv.slice(2).find((x) => x.startsWith(`--${k}=`))
  return a ? a.slice(k.length + 3) : dflt
}
const has = (k) => process.argv.slice(2).includes(`--${k}`)

const MODEL = flag('model')
if (!MODEL) { console.error('usage: --model=<slug> [--only=..] [--out=..] [--concurrency=N] [--effort=..]'); process.exit(2) }
const OUT_DIR = flag('out', `${E}/merge/out`)
const CONC = Number(flag('concurrency', '20'))
const EFFORT = flag('effort', 'high')
const MAX_VARIANTS = Number(flag('max-variants', '0')) // 0 = 전부
const MAX_TOKENS = Number(flag('max-tokens', '96000'))
const SHARD_DIR = flag('shard-dir', SHARD_DIR_DEFAULT)
const REQ_TIMEOUT_MS = Number(flag('timeout', '900')) * 1000
const DRY = has('dry')
const ONLY = flag('only') ? new Set(flag('only').split(',').map((s) => s.trim()).filter(Boolean)) : null

// ── 키 ──────────────────────────────────────────────────────────────────────
const envText = ['.env.local', '.env'].map((f) => (fs.existsSync(`${ROOT}/${f}`) ? fs.readFileSync(`${ROOT}/${f}`, 'utf8') : '')).join('\n')
const readEnv = (k) => {
  const m = envText.match(new RegExp(`^\\s*(?:export\\s+)?${k}\\s*=\\s*(.*)$`, 'm'))
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : null
}
const KEY = process.env.OPENROUTER_API_KEY ?? readEnv('OPENROUTER_API_KEY')
const BASE = (process.env.OPENROUTER_BASE_URL ?? readEnv('OPENROUTER_BASE_URL') ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '')
if (!KEY) { console.error('OPENROUTER_API_KEY 를 못 찾았다 (.env.local)'); process.exit(1) }

// ── 규범 슬라이스 (조립기와 같은 코드 경로를 쓴다 — 포크 금지) ──────────────
const spec = fs.readFileSync(`${ROOT}/docs/vocab-corpus-spec.md`, 'utf8').split('\n')
const sliceBetween = (startRe, endRe, label) => {
  const s = spec.findIndex((l) => startRe.test(l))
  const e = spec.findIndex((l, i) => i > s && endRe.test(l))
  if (s < 0 || e < 0) { console.error(`${label} 슬라이스 실패`); process.exit(1) }
  return spec.slice(s, e).join('\n')
}
const NORMS = `${sliceBetween(/^## 5\. `senseKo`/, /^## 6\. /, '§5')}\n\n${sliceBetween(/^## 10\. 4단계 — sense 병합 규범/, /^## 11\. /, '§10')}`
if (NORMS.length < 12000) { console.error(`규범이 너무 짧다: ${NORMS.length}`); process.exit(1) }

// ── 산출 스키마 (게이트가 기대하는 형상 그대로) ─────────────────────────────
const SCHEMA = {
  name: 'sense_merge',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['shardId', 'results', 'observations'],
    properties: {
      shardId: { type: 'string' },
      results: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['lemma', 'pos', 'clusters'],
          properties: {
            lemma: { type: 'string' },
            pos: { type: 'string' },
            clusters: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['senseKo', 'senseEn', 'memberKeys', 'why', 'examples'],
                properties: {
                  senseKo: { type: 'string', description: '대표 한글뜻. 공백·물결 제외 1~12자' },
                  senseEn: { type: 'string', description: '대표 영영정의. 3단어 이상. 표제어 자신을 쓰지 마라' },
                  memberKeys: { type: 'array', items: { type: 'string' }, description: '흡수한 senseKey 전부' },
                  why: { type: 'string', description: '치환 시험 근거' },
                  examples: { type: 'array', items: { type: 'string' }, description: '멤버 수 이상. 흡수된 멤버의 예문을 버리지 마라' },
                },
              },
            },
          },
        },
      },
      observations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'senseKeys', 'what'],
          properties: {
            kind: { type: 'string', enum: ['candidate-suspect', 'under-merge', 'sub-sense'] },
            senseKeys: { type: 'array', items: { type: 'string' } },
            what: { type: 'string' },
          },
        },
      },
    },
  },
}

const SYSTEM = [
  '너는 기출 영어 단어 코퍼스의 4단계 sense 병합 판정기다.',
  '같은 표제어(lemma+pos)에 흩어진 sense 후보들을 의미 단위로 묶는다.',
  '표현만 다르고 뜻이 같으면 합치고, 뜻이 다르면 반드시 따로 둔다.',
  '',
  '## 판정의 핵심 — 치환 시험 (§10.2)',
  '정의문이 비슷한지가 아니라 **서로 바꿔 쓸 수 있는지**로 판정한다.',
  '각 후보의 예문에 상대 후보의 뜻을 넣어 문장이 성립하면 같은 sense 다.',
  '- 문자열 유사도·자카드로 판정하지 마라. 그 방식은 이미 실패했다(§10.1).',
  '- 사역/기동 · 능동/수동 은 어떤 경우에도 합치지 않는다.',
  '- **애매하면 합치지 말고 나눠라.** 병합은 되돌리기가 비싸다(§10.3).',
  '',
  '## 기계가 강제하는 것',
  '- 전단사: 입력 senseKey 는 빠짐없이 정확히 한 번씩 어느 클러스터의 memberKeys 에 들어가야 한다.',
  '  입력에 없는 키를 지어내지 마라.',
  '- examples 개수는 그 클러스터의 memberKeys 개수 이상. 흡수된 멤버의 예문을 버리지 마라.',
  '- 같은 표제어 안에서 클러스터의 senseKo 가 서로 겹치면 안 된다.',
  '- senseKo 1~12자 · senseEn 3단어 이상.',
  '',
  '아래는 이 작업의 규범 전문이다.',
  '',
  NORMS,
].join('\n')

// ── 샤드 ────────────────────────────────────────────────────────────────────
let shardIds = fs.readdirSync(SHARD_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
if (ONLY) shardIds = shardIds.filter((id) => ONLY.has(id))
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.mkdirSync(`${E}/merge/quarantine`, { recursive: true })

const pending = shardIds.filter((id) => !fs.existsSync(`${OUT_DIR}/${id}.json`)) // 멱등
console.log(`모델 ${MODEL} · effort ${EFFORT} · 동시 ${CONC}`)
console.log(`샤드 ${shardIds.length}개 중 미처리 ${pending.length}개 → ${OUT_DIR}`)
if (!pending.length) { console.log('할 일 없음'); process.exit(0) }

const trim = (shard) => {
  if (!MAX_VARIANTS) return shard
  return {
    ...shard,
    items: shard.items.map((it) => ({
      ...it,
      candidates: it.candidates.map((c) => ({ ...c, senseEnVariants: (c.senseEnVariants ?? []).slice(0, MAX_VARIANTS) })),
    })),
  }
}

if (DRY) {
  const s = trim(JSON.parse(fs.readFileSync(`${SHARD_DIR}/${pending[0]}.json`, 'utf8')))
  console.log(`[dry] 시스템 ${SYSTEM.length}자 · 첫 샤드 ${JSON.stringify(s).length}자`)
  process.exit(0)
}

// ── 실행 ────────────────────────────────────────────────────────────────────
const cost = { in: 0, out: 0, cachedIn: 0, calls: 0, usd: 0 }
let done = 0, failed = 0
const t0 = Date.now()

async function callOnce(id) {
  const shard = trim(JSON.parse(fs.readFileSync(`${SHARD_DIR}/${id}.json`, 'utf8')))
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `샤드 ${id} 를 판정해라. shardId 는 "${id}" 로 그대로 적어라.\n\n${JSON.stringify(shard)}` },
    ],
    response_format: { type: 'json_schema', json_schema: SCHEMA },
    reasoning: { effort: EFFORT },
    usage: { include: true },
    // 후보가 많은 샤드는 산출 JSON 이 300KB 를 넘는다. 상한을 명시하지 않으면 문장 중간에서
    // 잘려 파싱 자체가 실패한다(실측 2026-08-03: s0000 이 position 327,025 에서 절단).
    max_tokens: MAX_TOKENS,
  }
  // 타임아웃 필수 — 실측 2026-08-03: 24후보짜리 작은 샤드 하나가 응답 없이 1시간 넘게 매달려
  // 전체 실행을 못 끝내게 만들었다. 끊고 재시도하는 편이 언제나 낫다.
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQ_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  const j = await res.json()
  const msg = j.choices?.[0]?.message
  const finish = j.choices?.[0]?.finish_reason
  if (!msg?.content) throw new Error(`빈 응답 (finish=${finish})`)
  let parsed
  try {
    parsed = JSON.parse(msg.content)
  } catch (e) {
    // 절단 여부를 사후에 판정할 수 있게 원문을 남긴다. 에러 메시지만으로는 원인을 못 가른다.
    fs.writeFileSync(`${E}/merge/quarantine/${id}.raw.txt`, msg.content)
    throw new Error(`JSON 파싱 실패 (finish=${finish} · 응답 ${msg.content.length}자) ${String(e.message).slice(0, 80)}`)
  }

  const u = j.usage ?? {}
  cost.calls++
  cost.in += u.prompt_tokens ?? 0
  cost.out += u.completion_tokens ?? 0
  cost.cachedIn += u.prompt_tokens_details?.cached_tokens ?? 0
  cost.usd += u.cost ?? 0
  return { parsed, shard }
}

/**
 * 예문 보강 — 모델이 빠뜨린 예문을 **원본 후보에서 결정론적으로 채운다.**
 *
 * 왜 이게 창작이 아닌가: 예문은 이미 입력 샤드 안에 memberKey 별로 들어 있다. 모델이 빠뜨린 것은
 * 판단 실패가 아니라 전사 실패이고, 여기서 하는 일은 그 좌표를 따라 원본을 복사하는 것뿐이다.
 * (실측 2026-08-03: luna 는 18표제어에서 예문 결손 24건을 냈다. 전단사·senseKo 는 멀쩡했다.)
 *
 * 게이트가 요구하는 것은 `examples.length >= memberKeys.length` 지만, 규범의 취지는
 * **흡수된 멤버마다 근거가 남는 것**이다. 그래서 개수만 채우지 않고 멤버별 대표를 보장한다.
 */
function backfillExamples(parsed, shard) {
  const src = new Map() // "lemma|pos␟senseKey" → candidate
  for (const it of shard.items ?? []) {
    for (const c of it.candidates ?? []) src.set(`${it.lemma}|${it.pos}␟${c.senseKey}`, c)
  }
  const text = (e) => (typeof e === 'string' ? e : (e?.en ?? '')).trim()
  let added = 0
  for (const r of parsed.results ?? []) {
    for (const cl of r.clusters ?? []) {
      const out = (cl.examples ?? []).filter((e) => text(e))
      for (const mk of cl.memberKeys ?? []) {
        const cand = src.get(`${r.lemma}|${r.pos}␟${mk}`)
        const pool = cand?.examples ?? []
        if (!pool.length) continue
        const poolEns = new Set(pool.map((e) => text(e)).filter(Boolean))
        // 이 멤버의 예문이 이미 하나라도 실려 있으면 건드리지 않는다.
        if (out.some((e) => poolEns.has(text(e)))) continue
        out.push(pool[0]); added++
      }
      // 그래도 개수가 모자라면(멤버에 예문 자체가 없는 경우) 남은 원본으로 채운다.
      let gi = 0
      const spare = (cl.memberKeys ?? []).flatMap((mk) => src.get(`${r.lemma}|${r.pos}␟${mk}`)?.examples ?? [])
      while (out.length < (cl.memberKeys ?? []).length && gi < spare.length) {
        const e = spare[gi++]
        if (text(e) && !out.some((x) => text(x) === text(e))) { out.push(e); added++ }
      }
      cl.examples = out
    }
  }
  return added
}

/**
 * senseKey 근사 복구 — 모델이 키를 **미세 변형**해 옮겨 적은 경우만 원본으로 되돌린다.
 *
 * 실측(2026-08-03): 전단사 위반의 다수가 "누락 1 · 창작 1" 짝으로 나온다. 키를 통째로 지어낸 게
 * 아니라 공백·대소문자·끝 구두점이 달라진 것이다. 그런 건 판정이 아니라 전사 오류다.
 *
 * ⚠️ 보수적으로만 고친다 — 정규화형이 **유일하게** 미사용 입력 키 하나에 대응할 때만 되돌린다.
 * 애매하면 손대지 않고 전단사 검사에서 실패시킨다. 잘못 이어 붙이면 다른 뜻에 멤버가 붙어
 * 조용한 오염이 되고, 그건 게이트도 못 잡는다.
 */
function recoverKeys(parsed, shard, log) {
  const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,;:]+$/, '')
  let fixed = 0
  for (const r of parsed.results ?? []) {
    const src = (shard.items ?? []).find((i) => i.lemma === r.lemma && i.pos === r.pos)
    if (!src) continue
    const inKeys = new Set(src.candidates.map((c) => c.senseKey))
    const byNorm = new Map()
    for (const k of inKeys) {
      const n = norm(k)
      byNorm.set(n, byNorm.has(n) ? null : k) // 중복 정규화형은 null 로 막는다
    }
    const used = new Set()
    for (const c of r.clusters ?? []) for (const k of c.memberKeys ?? []) if (inKeys.has(k)) used.add(k)
    for (const c of r.clusters ?? []) {
      c.memberKeys = (c.memberKeys ?? []).map((k) => {
        if (inKeys.has(k)) return k
        const cand = byNorm.get(norm(k))
        if (cand && !used.has(cand)) {
          used.add(cand); fixed++
          log.push(`${r.lemma}|${r.pos}: "${String(k).slice(0, 50)}" → "${cand.slice(0, 50)}"`)
          return cand
        }
        return k // 못 고치면 그대로 두고 전단사 검사에서 실패시킨다
      })
    }
  }
  return fixed
}

/**
 * 결과 컨테이너 정규화 — 판정 내용은 안 건드리고 **그릇만** 바로잡는다.
 *
 * 실측 2026-08-03 전량 실행에서 드러난 두 가지:
 *  ① 같은 표제어가 `results` 에 두 번 실린다 (31파일 94항목). 합집합 검사는 통과하지만
 *     게이트는 표제어별로 보므로 "절반 누락"으로 잡힌다.
 *  ② 클러스터가 엉뚱한 표제어 밑에 붙는다 (s0738: `smooth` 를 빈 껍데기로 두고 그 클러스터를
 *     `come with` 에 넣었다). 멤버 소유권이 깨끗하면 판단 없이 되돌릴 수 있다.
 *
 * 두 경우 다 판정 자체는 멀쩡하고 배치만 틀렸다. 여기서 고쳐야 전단사 검사가 의미를 갖는다.
 */
function normalizeResults(parsed, shard) {
  const own = new Map()
  for (const it of shard.items ?? []) for (const c of it.candidates ?? []) own.set(c.senseKey, `${it.lemma}|${it.pos}`)
  const byKey = new Map(); const order = []
  const put = (k, lemma, pos, cl) => {
    if (!byKey.has(k)) { byKey.set(k, { lemma, pos, clusters: [] }); order.push(k) }
    if (cl) byKey.get(k).clusters.push(cl)
  }
  for (const r of parsed.results ?? []) {
    for (const c of r.clusters ?? []) {
      const owners = [...new Set((c.memberKeys ?? []).map((k) => own.get(k)).filter(Boolean))]
      if (owners.length === 1) {
        const o = owners[0]
        put(o, o.slice(0, o.lastIndexOf('|')), o.slice(o.lastIndexOf('|') + 1), c)
      } else {
        put(`${r.lemma}|${r.pos}`, r.lemma, r.pos, c) // 못 가리면 선언대로 둔다 — 검사에서 걸린다
      }
    }
  }
  if (order.length) parsed.results = order.map((k) => byKey.get(k))
}

let backfilled = 0
let recovered = 0
const recoveryLog = []

async function run(id) {
  let lastErr
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { parsed, shard } = await callOnce(id)
      // 게이트가 요구하는 필드 중 모델에게 안 맡기는 것은 여기서 주입한다.
      for (const r of parsed.results ?? []) for (const c of r.clusters ?? []) if (c.reviewed === undefined) c.reviewed = null
      normalizeResults(parsed, shard)
      recovered += recoverKeys(parsed, shard, recoveryLog)
      backfilled += backfillExamples(parsed, shard)
      parsed.shardId = id
      /**
       * 전단사 점검은 **표제어별**로 해야 한다. 샤드 합집합으로 재면 A 의 키가 B 밑에 붙어도
       * 총량이 맞아 통과해 버린다 — 실측 2026-08-03: 그 구멍으로 critical 300건이 게이트까지
       * 흘러갔다. (게이트는 표제어별로 보므로 여기서 같은 기준을 써야 한다.)
       */
      const miss = [], extra = []
      let dupCount = 0
      for (const it of shard.items ?? []) {
        const key = `${it.lemma}|${it.pos}`
        const want = new Set(it.candidates.map((c) => c.senseKey))
        const got = (parsed.results ?? []).filter((r) => `${r.lemma}|${r.pos}` === key)
          .flatMap((r) => (r.clusters ?? []).flatMap((c) => c.memberKeys ?? []))
        dupCount += got.length - new Set(got).size
        for (const k of want) if (!got.includes(k)) miss.push(`${key}::${k}`)
        for (const k of got) if (!want.has(k)) extra.push(`${key}::${k}`)
      }
      if (miss.length || extra.length || dupCount) {
        // 무엇이 어떻게 어긋났는지 사후에 볼 수 있어야 한다 — 에러 문구만으로는 원인을 못 가른다.
        fs.writeFileSync(`${E}/merge/quarantine/${id}.bij.json`, JSON.stringify({ miss: miss.slice(0, 20), extra: extra.slice(0, 20), dupCount }, null, 1))
        throw new Error(`전단사 위반 (누락 ${miss.length} · 창작 ${extra.length} · 중복 ${dupCount})`)
      }
      // 보강 후에도 모자라면 원본에 예문이 없다는 뜻 — 게이트가 CRITICAL 로 막으므로 여기서 잡는다.
      const thin = (parsed.results ?? []).flatMap((r) => (r.clusters ?? []).filter((c) => (c.examples ?? []).length < (c.memberKeys ?? []).length))
      if (thin.length) throw new Error(`예문 부족 ${thin.length}건 (원본 보강으로도 못 채움)`)
      fs.writeFileSync(`${OUT_DIR}/${id}.json`, JSON.stringify(parsed, null, 1))
      done++
      return
    } catch (e) {
      lastErr = e
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt * attempt))
    }
  }
  failed++
  fs.writeFileSync(`${E}/merge/quarantine/${id}.err.txt`, String(lastErr?.message ?? lastErr))
  console.log(`  ✗ ${id} — ${String(lastErr?.message ?? lastErr).slice(0, 120)}`)
}

const queue = pending.slice()
const workers = Array.from({ length: Math.min(CONC, queue.length) }, async () => {
  while (queue.length) {
    const id = queue.shift()
    await run(id)
    if ((done + failed) % 25 === 0 || !queue.length) {
      const el = (Date.now() - t0) / 1000
      console.log(`  ${done + failed}/${pending.length} · 성공 ${done} 실패 ${failed} · ${el.toFixed(0)}s · $${cost.usd.toFixed(4)} · 캐시적중 ${cost.in ? ((cost.cachedIn / cost.in) * 100).toFixed(0) : 0}%`)
    }
  }
})
await Promise.all(workers)

const el = (Date.now() - t0) / 1000
console.log(`\n완료 ${done}/${pending.length} · 실패 ${failed} · ${el.toFixed(0)}초`)
console.log(`토큰 in ${cost.in.toLocaleString()} (캐시 ${cost.cachedIn.toLocaleString()}) · out ${cost.out.toLocaleString()}`)
console.log(`예문 보강 ${backfilled}건 (모델이 빠뜨린 것을 원본에서 복사)`)
console.log(`senseKey 근사 복구 ${recovered}건`)
if (recoveryLog.length) {
  fs.writeFileSync(`${E}/merge/key-recovery.log`, recoveryLog.join('\n'))
  console.log('  → merge/key-recovery.log 에 전건 기록 (사후 검증용)')
}
console.log(`비용 $${cost.usd.toFixed(4)}  ·  샤드당 평균 $${(cost.usd / Math.max(1, cost.calls)).toFixed(5)}`)
if (shardIds.length > pending.length) console.log(`(기존 산출 ${shardIds.length - pending.length}개는 건너뜀 — 멱등)`)
process.exit(failed ? 1 : 0)
