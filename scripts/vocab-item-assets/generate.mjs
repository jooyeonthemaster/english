// ============================================================================
// 문항 자산 캠페인 — luna 러너 (OpenRouter, json_schema strict)
//
// 도시에(dossier.mjs) 1건 → 문항 팩 1건. 검증된 운용 규약(vocab-merge-openrouter.mjs):
//   · max_tokens 반드시 명시(안 주면 큰 건이 출력 도중 잘린다)
//   · fetch 타임아웃 필수(없으면 1건이 전체를 붙든다)
//   · 규범을 프롬프트 최전방에 → 캐시 적중으로 반복분이 거의 공짜
//   · 멱등: 팩 파일이 이미 있으면 건너뜀 → 세션이 죽어도 재실행이 곧 재개
//   · 실패는 quarantine 목록으로 → Claude 에이전트 레인이 이어받는다
//
// 사용:
//   node scripts/vocab-item-assets/generate.mjs --pilot 50
//   node scripts/vocab-item-assets/generate.mjs --lemma "affect,person"
//   node scripts/vocab-item-assets/generate.mjs --file spellings.txt --concurrency 6
// ============================================================================
import fs from "fs";
import path from "path";
import { buildDossier, prisma } from "./dossier.mjs";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};

const MODEL = opt("model", "openai/gpt-5.6-luna");
const OUT = opt("out", "experiments/vocab-item-assets/packs");
const CONCURRENCY = Number(opt("concurrency", 6));
const SENSE_CHUNK = 8; // take(뜻 49개)류는 쪼개서 호출 — 출력 절단 방지
const TIMEOUT_MS = 240_000;

function readEnvLocal(key) {
  const t = fs.readFileSync(".env.local", "utf8");
  const m = t.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim() : null;
}
const KEY = process.env.OPENROUTER_API_KEY ?? readEnvLocal("OPENROUTER_API_KEY");
if (!KEY) { console.error("OPENROUTER_API_KEY 없음(.env.local)"); process.exit(1); }

// ── 출력 스키마 (strict) ─────────────────────────────────────────────────────

const S = (props, required = Object.keys(props)) => ({
  type: "object", properties: props, required, additionalProperties: false,
});
const arr = (items) => ({ type: "array", items });
const str = { type: "string" };
const nstr = { type: ["string", "null"] };
const bool = { type: "boolean" };

const PACK_SCHEMA = S({
  spelling: str,
  serve: bool,
  serveReason: nstr,
  displayLemma: str,
  variants: arr(S({
    pos: str,
    senses: arr(S({
      senseId: str,
      contextRequired: bool,
      contextReason: nstr,
      stems: arr(S({ exampleId: str, text: str, answerSurface: str })),
      meaningChoiceSets: arr(S({
        distractors: arr(S({ ko: str, whyPlausible: str, whyWrong: str })),
      })),
      wordChoiceDistractors: arr(S({ en: str, whyWrong: str })),
      hints: arr(str),
      spellEligible: bool,
      spellIneligibleReason: nstr,
      trapClaims: arr(S({ exampleId: str, claimKo: str, isTrue: bool, basis: str })),
    })),
  })),
});

// ── 규범(시스템 프롬프트) — 최전방 고정, 견본 포함 ──────────────────────────

const EXEMPLAR = fs.readFileSync("experiments/vocab-item-assets/exemplar/affect.pack.json", "utf8");

const NORM = `너는 수능 영어 어휘 문항 자산을 설계하는 베테랑 출제자다.
입력으로 한 단어(철자)의 완전한 도시에가 온다: 품사 변이, 전체 뜻(senseKo/senseEn/실빈도 occurrences),
실제 기출 예문, 함정노트(traps), 혼동어(confusables, 뜻 포함), 연어(collocations),
형태 정합이 맞춰진 오답 후보 풀(distractorCandidates), 동의어·파생형이 사전 배제된
영단어 오답 후보 풀(wordChoiceCandidates). 이 재료만으로 문항 팩을 만든다.

## 절대 규칙 (기계 게이트가 검사한다 — 어기면 전량 반려)

1. **창작 금지.** 오답의 ko는 도시에 안(distractorCandidates·confusables의 senseKo·같은 철자 다른 뜻·
   함정노트가 지목한 오독)에서만 고른다. 예문·표기를 지어내지 않는다. stems의 exampleId는 도시에의
   examples에서만, answerSurface는 그 예문 원문에 실제로 등장하는 굴절형 그대로.
2. **형태 정합.** 한 문항의 오답 3개는 정답 senseKo와 형태(절/구/단어, '~다' 종결 여부, 길이 급)가
   비슷해야 한다. 정답만 절 형태이거나 정답만 길면 학생이 뜻을 몰라도 맞힌다.
3. **복수 정답 금지.** 오답이 그 문맥·그 뜻에서 사실상 정답으로 성립하면 안 된다(동의어 배제).
   각 sense의 **bannedKo 목록에 있는 표기는 전부 그 sense의 정답이다 — 어떤 오답에도 절대 쓰지 마라**
   (띄어쓰기·물결·구두점만 다른 변형은 물론, **어미만 다른 변형**('정확히'↔'정확하게')도 동일 표기다).
3-1. **wordChoiceDistractors는 그 sense의 wordChoiceCandidates 목록에서만 고른다(en 표기 그대로).**
   이 풀은 동의어·어간 공유 파생형·품사 불일치가 DB 검사로 이미 배제된 안전 목록이다.
   목록 밖 단어를 쓰면 게이트가 DB 역조회로 반려한다 — 특히 "철자만 다른 유의어"
   (undergo를 '겪다'의 오답으로)가 전형적 반려 사유였다. 네 일은 목록 16개 중에서
   **가장 헷갈릴 만한 3개를 고르는 것**이다: 철자·발음이 비슷한 것, 의미장이 인접하되
   이 뜻으로는 오역이 되는 것, 혼동어(confusables)와 겹치는 것을 우선하라.
4. **비대표·저빈도 뜻은 contextRequired=true.** occurrences가 대표 뜻 대비 현저히 낮거나 전문 문맥
   전용이면 반드시 true + contextReason. 이런 뜻은 stems(문맥)가 1개 이상 필수다.
5. **의도된 함정을 최우선으로.** 혼동어(effect↔affect류)·형태 혼동·같은 철자의 다른 뜻('사람' vs '인칭')·
   함정노트가 기록한 실제 오독이 오답 1순위다. 무관 랜덤 오답은 최후 수단.
6. **힌트 금지어.** 글자 수·티어·난이도 숫자·품사 반복(화면에 이미 표시됨)을 힌트에 쓰지 않는다.
   힌트는 의미 단서다: 연어, 뉘앙스, 혼동 경고, 어원. 두 가지 누설을 특히 조심하라:
   ① **표제어 누설** — 연어·구문을 보여줄 때 표제어 자리는 예외 없이 ____ 로 마스킹한다
   (굴절형·여러 낱말 표제어도 전부: "be ____ed by", "____ cooperative").
   ② **정답 뜻 누설** — 힌트 문장 안에 senseKo·bannedKo의 표기가 그대로 들어가면 선지에서 즉답된다.
   연어를 번역할 때도 정답 표기를 피해 다른 말로 풀어 써라("완전히 흥분한"이 정답 '완전히'를
   누설하면 "몹시 달아오른"으로).
7. **해설(whyWrong·basis)은 학생에게 보여줄 존댓말 1~2문장.** whyPlausible은 내부 설계 근거(평서문).
8. **아티팩트 판정.** 표제어가 플레이스홀더 골격('not a because b', 'of one's', 'there be',
   'for a to b' 등 a/b 변수식·기능어 결합 잔재)이면 serve=false + serveReason. 실제 숙어는
   displayLemma를 표준 표기로 정형한다(예: "not A because B" → 대문자 변수 표기).
9. **stems 규칙.** 예문이 길면 홀로 읽혀도 성립하게 축약해도 된다(의미·인용부·비교구문 보존).
   빈칸은 ____ 로 표기하고 answerSurface(원문 굴절형)를 별도 기록한다. 지시어(this/they)가
   가리키는 대상이 잘려나간 문장은 쓰지 않는다.
10. **수량.** sense마다: meaningChoiceSets 2세트(각 오답 정확히 3개), wordChoiceDistractors 3개,
    hints 정확히 2개, stems 1~2개(contextRequired면 1개 이상 필수), trapClaims 0~2개(문장에서
    판정 근거를 댈 수 있는 것만 — basis 필수. 참 주장은 senseKo 복붙 대신 자연스러운 표현 변주 허용).
11. **spellEligible.** 숙어·구·기능어(2~3글자 초고빈도)·뜻만으로 동의어와 구분 불가한 것은 false +
    사유. 내용어 단일 낱말만 true.

## 견본 (이 품질이 기준선이다 — affect)

${EXEMPLAR}

입력 도시에의 variants에 실린 **모든 sense**에 대해 팩을 산출하라 — 단, **variants에 있는 sense만**
산출한다. otherSenses 목록은 오답·함정 설계용 참고 자료일 뿐 산출 대상이 아니다.
출력은 스키마를 따르는 JSON 하나뿐이다.`;

// ── luna 호출 ────────────────────────────────────────────────────────────────

const usage = { in: 0, out: 0, cachedIn: 0, calls: 0 };
// 러너 단위 하드 비용 상한 — 지시: "대충 했다가 API 폭탄은 절대 용납 못한다".
// 기본값도 유한하다(상한 없는 런 자체가 금지). 전량 팬아웃은 --max-cost로 명시 상향.
const MAX_COST = Number(opt("max-cost", 8));
const costNow = () =>
  (usage.in - usage.cachedIn) * 0.10 / 1e6 + usage.cachedIn * 0.01 / 1e6 + usage.out * 0.60 / 1e6;

async function callModel(dossierJson, senseCount) {
  const maxTokens = Math.min(30_000, 2_500 + 1_600 * senseCount);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: NORM },
          { role: "user", content: `도시에:\n${dossierJson}` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "vocab_item_pack", strict: true, schema: PACK_SCHEMA },
        },
      }),
    });
    const body = await res.json();
    if (!res.ok || body.error) throw new Error(`API ${res.status}: ${JSON.stringify(body.error ?? body).slice(0, 300)}`);
    const choice = body.choices?.[0];
    if (!choice?.message?.content) throw new Error("빈 응답");
    if (choice.finish_reason === "length") throw new Error("출력 절단(max_tokens)");
    usage.in += body.usage?.prompt_tokens ?? 0;
    usage.out += body.usage?.completion_tokens ?? 0;
    usage.cachedIn += body.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    usage.calls++;
    return JSON.parse(choice.message.content);
  } finally {
    clearTimeout(timer);
  }
}

// ── 도시에 청킹 — 거대 표제어(take 뜻 49개)는 sense 8개 단위로 나눠 호출 ────

function chunkDossier(d) {
  const total = d.senseCount;
  if (total <= SENSE_CHUNK) return [d];
  const chunks = [];
  for (const v of d.variants) {
    for (let i = 0; i < v.senses.length; i += SENSE_CHUNK) {
      const senses = v.senses.slice(i, i + SENSE_CHUNK);
      chunks.push({
        ...d,
        note: `대형 다의어 분할 처리분(${i + 1}~${i + senses.length}/${total}뜻). 다른 뜻 목록은 otherSenses 참조(오답·함정 설계에 활용).`,
        otherSenses: d.variants.flatMap((vv) =>
          vv.senses.filter((s) => !senses.includes(s)).map((s) => ({ pos: vv.pos, senseKo: s.senseKo, senseOrder: s.senseOrder })),
        ),
        variants: [{ ...v, senses }],
      });
    }
  }
  return chunks;
}

// ── 결정론 교정 — 재호출 없이 고칠 수 있는 컨테이너 결함은 코드가 고친다 ────
// (sense 병합 캠페인 교훈: "결과 컨테이너 오류는 판정 오류가 아니다")

function repairPack(pack, dossier) {
  const allowed = new Set(dossier.variants.flatMap((v) => v.senses.map((s) => s.senseId)));
  let dropped = 0, blanked = 0;
  for (const v of pack.variants) {
    const seen = new Set();
    v.senses = v.senses.filter((s) => {
      // otherSenses까지 산출하며 지어낸 ID·중복 ID 폐기
      if (!allowed.has(s.senseId) || seen.has(s.senseId)) { dropped++; return false; }
      seen.add(s.senseId);
      return true;
    });
    for (const s of v.senses) {
      for (const st of s.stems) {
        // 빈칸 누락 자동 치환 — 원문 그대로 두고 answerSurface만 안 지운 경우
        if (!st.text.includes("____") && st.answerSurface?.trim()) {
          const esc = st.answerSurface.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const re = new RegExp(`(?<![A-Za-z])${esc}(?![A-Za-z])`, "i");
          if (re.test(st.text)) { st.text = st.text.replace(re, "____"); blanked++; }
        }
      }
    }
  }
  pack.variants = pack.variants.filter((v) => v.senses.length);
  return { dropped, blanked };
}

function mergeChunkPacks(packs) {
  const base = { ...packs[0], variants: [] };
  const byPos = new Map();
  for (const p of packs) {
    for (const v of p.variants) {
      if (!byPos.has(v.pos)) byPos.set(v.pos, { pos: v.pos, senses: [] });
      byPos.get(v.pos).senses.push(...v.senses);
    }
  }
  base.variants = [...byPos.values()];
  base.serve = packs.every((p) => p.serve);
  return base;
}

// ── 처리 파이프 ──────────────────────────────────────────────────────────────

const packFile = (sp) => path.join(OUT, `${sp.replace(/[^a-z0-9]+/gi, "_")}.pack.json`);

async function processSpelling(sp) {
  const file = packFile(sp);
  if (fs.existsSync(file)) return "skip";
  const d = await buildDossier(sp);
  if (!d) return "no-dossier";
  const chunks = chunkDossier(d);
  const results = [];
  for (const c of chunks) {
    const json = JSON.stringify(c);
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await callModel(json, c.variants.reduce((a, v) => a + v.senses.length, 0));
        repairPack(raw, c);
        results.push(raw);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      }
    }
    if (lastErr) throw lastErr;
  }
  const pack = results.length === 1 ? results[0] : mergeChunkPacks(results);
  pack._meta = { model: MODEL, senseCount: d.senseCount, chunks: chunks.length };
  fs.writeFileSync(file, JSON.stringify(pack, null, 1));
  return "ok";
}

// ── 대상 선정 ────────────────────────────────────────────────────────────────

async function pilotSample(n) {
  const LIVE = { retiredAt: null };
  const byFreq = [{ per10k: { sort: "desc", nulls: "last" } }, { id: "asc" }];
  const pick = async (where, take) =>
    (await prisma.vocabDrillLemma.findMany({ where: { ...LIVE, ...where }, orderBy: byFreq, take, select: { lemma: true } })).map((r) => r.lemma);
  const buckets = await Promise.all([
    pick({ pos: { in: ["idiom", "phrasal_verb"] } }, Math.ceil(n * 0.2)),          // 숙어·구동사
    pick({ senseCount: { gte: 3 } }, Math.ceil(n * 0.2)),                          // 다의어
    pick({ pos: { in: ["noun", "verb", "adjective"] }, senseCount: 1 }, Math.ceil(n * 0.4)), // 일반 지대
    pick({ pos: "adjective" }, Math.ceil(n * 0.1)),                                // 형용사(혼동어 밀집)
    pick({ lemma: { contains: " a " } }, Math.ceil(n * 0.1)),                      // 아티팩트 검출 확인용
  ]);
  return [...new Set(buckets.flat())].slice(0, n);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let targets = [];
  if (args.includes("--all")) {
    // 전량 — 빈도 내림차순: 서빙 확률 높은 단어의 팩이 먼저 깔린다
    const rows = await prisma.vocabDrillLemma.findMany({
      where: { retiredAt: null },
      orderBy: [{ per10k: { sort: "desc", nulls: "last" } }, { id: "asc" }],
      select: { lemma: true },
    });
    targets = [...new Set(rows.map((r) => r.lemma))];
  } else if (opt("pilot")) targets = await pilotSample(Number(opt("pilot")));
  else if (opt("lemma")) targets = opt("lemma").split(",").map((s) => s.trim()).filter(Boolean);
  else if (opt("file")) targets = fs.readFileSync(opt("file"), "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  else { console.error("--pilot N | --lemma a,b | --file list.txt"); process.exit(1); }

  console.log(`대상 ${targets.length}건 · 모델 ${MODEL} · 동시 ${CONCURRENCY} · 산출 ${OUT}`);
  const queue = [...targets];
  const failed = [];
  let done = 0, skipped = 0;
  const t0 = Date.now();

  let budgetTripped = false;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      if (costNow() >= MAX_COST) {
        if (!budgetTripped) {
          budgetTripped = true;
          console.error(`⛔ 비용 상한 $${MAX_COST} 도달(현재 $${costNow().toFixed(2)}) — 잔여 ${queue.length}건 중단. 재실행이 곧 재개다.`);
        }
        queue.length = 0;
        break;
      }
      const sp = queue.shift();
      try {
        const r = await processSpelling(sp);
        if (r === "skip") skipped++;
        else if (r === "ok") done++;
        else failed.push({ sp, err: r });
      } catch (e) {
        failed.push({ sp, err: String(e.message ?? e).slice(0, 200) });
      }
      const total = done + skipped + failed.length;
      if (total % 10 === 0) {
        console.log(`  ${total}/${targets.length} (완료 ${done} · 스킵 ${skipped} · 실패 ${failed.length}) · in ${(usage.in / 1e6).toFixed(1)}M(캐시 ${(usage.cachedIn / 1e6).toFixed(1)}M) out ${(usage.out / 1e6).toFixed(2)}M`);
      }
    }
  }));

  const cost = costNow();
  console.log(`\n완료 ${done} · 스킵 ${skipped} · 실패 ${failed.length} · ${((Date.now() - t0) / 60000).toFixed(1)}분${budgetTripped ? " · ⛔상한중단" : ""}`);
  console.log(`토큰: in ${(usage.in / 1e6).toFixed(2)}M (캐시 ${(usage.cachedIn / 1e6).toFixed(2)}M) · out ${(usage.out / 1e6).toFixed(2)}M · 호출 ${usage.calls} · 비용 ≈ $${cost.toFixed(2)}`);
  if (failed.length) {
    const qf = path.join(OUT, "quarantine.jsonl");
    fs.appendFileSync(qf, failed.map((f) => JSON.stringify(f)).join("\n") + "\n");
    console.log(`실패 목록 → ${qf} (Claude 에이전트 레인 인계 대상)`);
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
