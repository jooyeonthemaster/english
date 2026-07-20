// H-G5: flash3@사고 프로덕션 구조 스크리닝 — 6개 구조 암 × 10지문 × 빈칸·어법
// 전 암 완제품 스키마 출력 + 결정형 게이트(0원) 내장. 예산 가드 $8. 재개 지원.
import fs from "node:fs";
import path from "node:path";

const root = "d:/Desktop/2026project/nara";
const envText = fs.readFileSync(path.join(root, ".env.local"), "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "google/gemini-3-flash-preview";
const BUDGET_USD = 8.0;
const HERE = "C:/Users/jooye/AppData/Local/Temp/claude/d--Desktop-2026project-nara/81d49447-f31d-47df-9490-6666fe3f6f9c/scratchpad/";
const STAGE = process.env.HG5_STAGE ?? "1";
const OUT = HERE + (STAGE === "1" ? "hg5-results.jsonl" : STAGE === "2" ? "hg5b-results.jsonl" : "hg5c-results.jsonl");
const ARM_FILTER = (process.env.HG5_ARMS ?? "").split(",").filter(Boolean);

// stage1: 지문 1~10 / stage2(확증): 오염 지문(15·18) 제외 전체 23지문
const corpus = JSON.parse(fs.readFileSync(HERE + "hg3-corpus.json", "utf8")).filter((p) =>
  STAGE === "1" ? p.idx >= 1 && p.idx <= 10 : p.idx !== 15 && p.idx !== 18,
);
console.log(`stage${STAGE} passages:`, corpus.map((p) => p.idx).join(","));

// ── 공용: 완제품 스키마 프롬프트 ─────────────────────────────────────────────
const BLANK_CONTRACT = `출력 JSON 스키마(완제품):
{"passageWithBlank":"지문 전체를 그대로 싣되 뚫은 구만 _____ 로 치환","originalExpression":"뚫은 원문 구(축자)","options":[{"label":1,"text":"..."},...5개],"correctAnswer":<1~5 숫자>,"explanation":"한국어 해설(합니다체): 빈칸 역할→근거 연결→정답 도출","wrongOptionExplanations":{"<오답라벨>":"함정 기제 한 문장",...4개},"keyPoints":["...","...","..."]}

절대 규칙(위반 시 반려):
R1. originalExpression 은 지문에 축자로 존재해야 하며, 문장 전체를 삼키면 안 된다(구·절 단위).
R2. 빈칸 직후에 빈칸 내용에 문법적으로 의존하는 잔여 구문을 남기지 마라 — 예: ", nor ...", ", which ...", "behind which ..." 가 빈칸 바로 뒤에 오게 뚫는 것 금지.
R3. 선지 5개 전부 빈칸 자리에 문법적으로 정확히 들어가야 한다(품사·절/구 형태 통일).
R4. 정답 선지는 원문 표현의 표면 어휘를 재사용하지 않는 추상적 패러프레이즈. 오답 4개는 서로 다른 함정 기제(극성 반전·과확장·과협소·인과 역전·절반-진실)로, 본문 소재를 재활용해 매력도를 높여라.
R5. 표적은 논지 핵심 — 주변 단서만으로 즉답되지 않고 글 전체 논리 종합이 필요한 자리.`;

const GRAMMAR_CONTRACT = `출력 JSON 스키마(완제품):
{"passageWithMarkers":"지문 전체를 그대로 싣되 밑줄 5곳을 (A)[표현] 형식으로 마킹 — 정답 1곳만 원문을 어법상 틀린 형태로 변형","underlines":[{"label":"(A)","original":"원문 축자 표현","shown":"문항에 표시되는 표현(정답만 변형)"},...5개],"correctAnswer":"(X)","fix":"고친 형태","explanation":"한국어 해설(합니다체): 정답 구문 분석→왜 비문인지→고친 형태","wrongOptionExplanations":{"(A)":"...",...오답 4개 각 한 문장},"keyPoints":["...","...","..."]}

절대 규칙(위반 시 반려):
R1. 서로 다른 문장에서 5개 세그먼트. original 은 전부 지문 축자. shown 은 정답 1개만 original 과 다르고 나머지 4개는 동일.
R2. 변형 포인트는 구조 판단형(정동사/준동사·관계사·분사 태·병렬·도치) — 인접 수일치·품사 표면 치환 같은 뻔한 포인트 회피.
R3. 오답 밑줄 4개도 각각 판단 근거가 뚜렷한 어법 포인트(장식용 금지).
R4. 해설의 구조 분석은 실제 문장 구조와 정확히 일치해야 한다(선행사·절 경계·수식 관계 오귀속 금지).`;

function genPrompt(p, qtype, extra = "") {
  const contract = qtype === "blank" ? BLANK_CONTRACT : GRAMMAR_CONTRACT;
  const kind = qtype === "blank" ? "'빈칸 추론'" : "'어법(밑줄 5개 중 틀린 것)'";
  return `너는 수능 영어 킬러 문항 출제 전문가다. 아래 지문으로 ${kind} KILLER 문항 1개를 완제품 형태로 만들어라.${extra ? "\n" + extra : ""}

${contract}

출력은 JSON만.

## 지문
${p.content}`;
}

const EXPL_QUALITY_ADDON = `
해설 품질 계약(위반 시 반려):
E1. 해설의 구조 분석(선행사·절 경계·수식 관계·품사 판정)은 실제 문장을 재파싱한 결과와 정확히 일치해야 한다 — 틀린 근거로 맞는 결론을 내는 것도 결함이다.
E2. 해설이 인용하는 영어 표현은 지문·선지·고친 형태에 실재하는 것만 쓴다(존재하지 않는 단어 인용 금지).
E3. 해설이 지문 두 표현의 관계를 서술할 때는 그 관계가 실제 문장에서 성립하는 짝인지 확인한다(다른 문장의 표현을 붙여 쓰지 마라).
E4. 한국어는 표준어만: 존재하지 않는 단어(오타·비어) 금지, 조사·어미 정확히, 합니다체 통일.`;

const SELF_VERIFY_ADDON = `
생성 후 반드시 스스로 적대 검증을 수행하고 통과한 최종본만 출력하라(사고 과정에서):
V1. 정답을 가리고 직접 풀어 유일 정답인지 — 다른 선지/밑줄이 성립하면 재설계.
V2. 해설의 구조 분석 주장(선행사·절 경계·근거 인용)을 지문과 문장 단위 대조 — 하나라도 어긋나면 해설 재작성.
V3. 절대 규칙 R1~R5 전수 재확인.`;

function verifyRepairPrompt(p, qtype, item) {
  return `너는 수능 문항의 최종 검수·수리 책임자다. 아래 완제품 문항을 적대적으로 재파싱해 결함을 찾고, 결함이 있으면 고친 완제품 전체를 출력하라.

검사 축(전부 수행, 사고 과정에서 하나씩 명시적으로):
①정답 유일성 — 정답을 가리고 직접 풀고, 타 선지/밑줄 각각에 대해 "이것도 정답이 될 수 있는가"를 반박 시도.
②${qtype === "blank" ? "선지 대입 문법검사 — 5개 선지 각각을 빈칸에 대입한 완전한 문장을 만들어 하나씩 문법성 판정(주어-동사 일치·품사 자리·잔여 구문과의 결합 포함). 하나라도 비문이면 결함." : "오답 밑줄 4개 각각이 원문 그대로이며 어법상 옳은지 개별 재파싱."}
③해설 사실성 — 해설·오답해설의 모든 구조 주장(선행사·절 경계·품사·수식 관계)을 실제 문장과 대조. 해설이 인용하는 영어 표현이 지문·선지·고친 형태에 실재하는지, 두 표현의 관계 서술이 실제 그 짝인지 확인. 틀린 근거로 맞는 결론을 내는 해설도 결함.
④한국어 품질 — 존재하지 않는 단어(오타·비어)·깨진 조사·어투 혼용 검사.
⑤${qtype === "blank" ? "빈칸 절단 건전성 — 잔여 의존 구문(트레일링 등위·고아 관계절)·문장 전체 삼킴 여부." : "변형 1개 원칙 — 지문의 나머지가 원문과 완전 동일한지."}
본체(선지·정답)를 수정할 경우 반드시 수정본을 스스로 다시 풀어 유일성을 재확인하고, 지문 텍스트는 절대 수정하지 마라(변형 1개 제외).

출력(JSON만): 결함 없으면 {"verdict":"PASS"} 만. 결함 있으면 {"verdict":"FIXED","defectsFound":["..."],"item":<고친 완제품 전체(원 스키마 동일)>}.

## 원지문
${p.content}

## 문항(완제품 JSON)
${JSON.stringify(item)}`;
}

function judgePrompt(p, qtype, itemA, itemB) {
  return `너는 수능 문항 심사위원장이다. 같은 지문으로 만든 두 후보 문항을 각각 재파싱·풀이해 심사하고, 더 우수한 쪽을 골라 필요한 미세 수정을 가한 최종 완제품을 출력하라.

심사 기준(순서대로): ①치명 결함 없음(정답 유일성·선지 문법 적합·해설 사실 정합) ②킬러 공예(표적이 논지 핵심, 정답의 추상 패러프레이즈 수준, 오답 함정 매력도) ③둘 다 결함이 있으면 덜 치명적인 쪽을 고쳐라. 수정 시 스스로 재풀이로 유일성 확인.

출력(JSON만): {"chosen":"A"|"B","reason":"한 문장","item":<최종 완제품(원 스키마 동일)>}

## 원지문
${p.content}

## 후보 A
${JSON.stringify(itemA)}

## 후보 B
${JSON.stringify(itemB)}`;
}

function solvePrompt(p, qtype, item) {
  if (qtype === "blank") {
    return `다음 빈칸 문항을 풀어라. 답만 JSON 으로: {"answer":<1~5>}

${item.passageWithBlank}

선지: ${(item.options || []).map((o) => `${o.label}) ${o.text}`).join("  ")}`;
  }
  return `다음 어법 문항을 풀어라(밑줄 중 어법상 틀린 것). 답만 JSON 으로: {"answer":"(X)"}

${item.passageWithMarkers}

선지: ${(item.underlines || []).map((u) => `${u.label} ${u.shown}`).join("  ")}`;
}

// ── 결정형 게이트(0원) ────────────────────────────────────────────────────────
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
function gateCheck(qtype, item, passage) {
  const v = [];
  if (!item || typeof item !== "object") return ["PARSE_FAIL"];
  const pnorm = norm(passage);
  if (qtype === "blank") {
    if (!Array.isArray(item.options) || item.options.length !== 5) v.push("OPTIONS_NOT_5");
    const ans = Number(item.correctAnswer);
    if (!(ans >= 1 && ans <= 5)) v.push("ANSWER_INVALID");
    const oe = norm(item.originalExpression);
    if (!oe || !pnorm.includes(oe)) v.push("ORIGINAL_NOT_VERBATIM");
    if (!String(item.passageWithBlank ?? "").includes("_____")) v.push("NO_BLANK_MARKER");
    if (oe && pnorm.includes(oe)) {
      const sentences = pnorm.split(/(?<=[.!?])\s+/);
      const host = sentences.find((s) => s.includes(oe));
      if (host && oe.length >= host.length * 0.88) v.push("FULL_SENTENCE_SWALLOW");
    }
    const after = String(item.passageWithBlank ?? "").split("_____")[1] ?? "";
    if (/^\s*,?\s*(nor\b|which\b|behind which|in which|whom\b|and neither)/i.test(after)) v.push("TRAILING_DEPENDENT");
  } else {
    const us = item.underlines;
    if (!Array.isArray(us) || us.length !== 5) return [...v, "UNDERLINES_NOT_5"];
    let changed = 0;
    for (const u of us) {
      if (!u.original || !pnorm.includes(norm(u.original))) v.push("ORIG_NOT_VERBATIM:" + u.label);
      if (norm(u.shown) !== norm(u.original)) changed += 1;
    }
    const ansSeg = us.find((u) => u.label === item.correctAnswer);
    if (changed !== 1) v.push("CHANGED_" + changed);
    else if (ansSeg && norm(ansSeg.shown) === norm(ansSeg.original)) v.push("ANSWER_SEG_UNCHANGED");
    for (const lb of ["(A)","(B)","(C)","(D)","(E)"]) { if (!String(item.passageWithMarkers ?? "").includes(lb)) { v.push("MARKER_MISSING:" + lb); break; } }
  }
  // 인용 토큰 실재(신규): 해설이 따옴표로 인용한 영어 표현은 지문·선지·fix 에 실재해야
  // 한다('attaches' 환각류 차단). 오탐 방지: 허용 코퍼스에 문항 전 필드 포함, 소프트 위반.
  try {
    const expl = [item.explanation, JSON.stringify(item.wrongOptionExplanations ?? ""), (item.keyPoints ?? []).join(" ")].join(" ");
    const allowedCorpus = norm(
      passage + " " + JSON.stringify(item.options ?? "") + " " + JSON.stringify(item.underlines ?? "") + " " +
      String(item.fix ?? "") + " " + String(item.originalExpression ?? "") + " " + String(item.correctAnswer ?? "")
    ).toLowerCase();
    const quoted = [...expl.matchAll(/['‘“"]([A-Za-z][A-Za-z .,-]{2,60})['’”"]/g)].map((m) => m[1].trim());
    for (const q of quoted) {
      // 중략(...)·쉼표 인용은 조각으로 분할해 각각 검사 — 정상 해설 관행 오탐 방지.
      const frags = q.split(/\.{2,}|…|,/).map((f) => f.trim()).filter((f) => f.length >= 12);
      for (const f of frags) {
        if (!allowedCorpus.includes(f.toLowerCase())) { v.push("QUOTED_TOKEN_MISSING:" + f.slice(0, 30)); break; }
      }
      if (v.some((x) => String(x).startsWith("QUOTED_TOKEN_MISSING"))) break;
    }
  } catch {}
  // 지문 무결성(신규): 마커/빈칸을 원문으로 되돌렸을 때 소스와 일치해야 한다.
  // U029 사례(정답 문장 무단 침묵 편집) 차단용 — 0원 결정형.
  try {
    if (qtype === "blank" && item.passageWithBlank && item.originalExpression) {
      const rec = norm(String(item.passageWithBlank).replace("_____", String(item.originalExpression)));
      if (rec !== pnorm) v.push("PASSAGE_TAMPERED");
    } else if (qtype === "grammar" && item.passageWithMarkers && Array.isArray(item.underlines)) {
      let rec = String(item.passageWithMarkers);
      for (const u of item.underlines) {
        rec = rec.split(`${u.label}[${u.shown}]`).join(String(u.original));
      }
      rec = norm(rec.replace(/\([A-E]\)\[/g, "").replace(/\]/g, ""));
      if (rec !== pnorm) v.push("PASSAGE_TAMPERED");
    }
  } catch {}
  return v;
}

// ── LLM 콜 ───────────────────────────────────────────────────────────────────
let spent = 0;
async function call(prompt, effort, maxTokens, label) {
  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      stream: false,
      usage: { include: true },
      reasoning: { enabled: true, effort, exclude: true },
    }),
    signal: AbortSignal.timeout(240_000),
  });
  const json = await res.json().catch(() => null);
  const ms = Date.now() - t0;
  if (!res.ok || !json || json.error) return { ok: false, ms, label, error: JSON.stringify(json?.error ?? {}).slice(0, 150) };
  const u = json.usage ?? {};
  spent += Number(u.cost) || 0;
  return { ok: true, ms, label, costUsd: u.cost ?? 0, rsn: u.completion_tokens_details?.reasoning_tokens ?? null, finish: json.choices?.[0]?.finish_reason, text: json.choices?.[0]?.message?.content ?? "" };
}
function parseJson(text) {
  let t = (text || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "");
  const s = t.indexOf("{"); if (s > 0) t = t.slice(s);
  try { return JSON.parse(t); } catch {}
  const e = t.lastIndexOf("}"); if (e > 0) { try { return JSON.parse(t.slice(0, e + 1)); } catch {} }
  return null;
}

// gen + 게이트 + 위반 시 1회 재생성 (모든 암 공용 빌딩블록)
async function genWithGate(p, qtype, effort, extra, calls) {
  let r = await call(genPrompt(p, qtype, extra), effort, 16000, "gen");
  calls.push(r);
  let item = r.ok ? parseJson(r.text) : null;
  let viol = gateCheck(qtype, item, p.content);
  let retries = 0;
  if (viol.length) {
    const r2 = await call(genPrompt(p, qtype, extra) + `\n\n[반려 재생성] 직전 출력이 규칙 위반으로 반려됨: ${viol.join(", ")}. 위반을 해소한 완제품을 다시 만들어라.`, effort, 16000, "regen");
    calls.push(r2); retries = 1;
    const item2 = r2.ok ? parseJson(r2.text) : null;
    const viol2 = gateCheck(qtype, item2, p.content);
    if (viol2.length < viol.length || (item2 && !item)) { item = item2; viol = viol2; }
  }
  return { item, viol, retries };
}

// ── 암 정의 ──────────────────────────────────────────────────────────────────
const ARMS = {
  S1: async (p, qtype) => { // 원샷+게이트
    const calls = [];
    const g = await genWithGate(p, qtype, "high", "", calls);
    return { item: g.item, viol: g.viol, gateRetries: g.retries, calls };
  },
  S2: async (p, qtype) => { // 원샷+셀프적대검증
    const calls = [];
    const g = await genWithGate(p, qtype, "high", SELF_VERIFY_ADDON, calls);
    return { item: g.item, viol: g.viol, gateRetries: g.retries, calls };
  },
  S3: async (p, qtype) => { // 생성→통합 검수리
    const calls = [];
    const g = await genWithGate(p, qtype, "high", "", calls);
    if (!g.item) return { item: null, viol: g.viol, gateRetries: g.retries, calls };
    const vr = await call(verifyRepairPrompt(p, qtype, g.item), "high", 18000, "verify-repair");
    calls.push(vr);
    let item = g.item, verdict = "PASS_DEFAULT";
    if (vr.ok) {
      const j = parseJson(vr.text);
      verdict = j?.verdict ?? "UNPARSED";
      if (j?.verdict === "FIXED" && j.item) {
        const fviol = gateCheck(qtype, j.item, p.content);
        if (!fviol.length) item = j.item; else verdict = "FIXED_GATE_REJECTED";
      }
    }
    return { item, viol: gateCheck(qtype, item, p.content), gateRetries: g.retries, verdict, calls };
  },
  S4: async (p, qtype) => { // 병렬 2생성→심판
    const calls = [];
    const [a, b] = await Promise.all([
      genWithGate(p, qtype, "high", "표적 선호: 지문 전반부의 논지 축을 우선 검토하라.", calls),
      genWithGate(p, qtype, "high", "표적 선호: 지문 후반부·결론부의 논지 축을 우선 검토하라.", calls),
    ]);
    const cands = [a.item, b.item].filter(Boolean);
    if (!cands.length) return { item: null, viol: ["BOTH_GEN_FAILED"], gateRetries: a.retries + b.retries, calls };
    if (cands.length === 1) return { item: cands[0], viol: gateCheck(qtype, cands[0], p.content), gateRetries: a.retries + b.retries, calls };
    const jd = await call(judgePrompt(p, qtype, a.item, b.item), "high", 20000, "judge");
    calls.push(jd);
    let item = a.item, chosen = "A_DEFAULT";
    if (jd.ok) {
      const j = parseJson(jd.text);
      if (j?.item) { const jviol = gateCheck(qtype, j.item, p.content); if (!jviol.length) { item = j.item; chosen = j.chosen ?? "?"; } else { item = (j.chosen === "B" ? b.item : a.item); chosen = (j.chosen ?? "A") + "_RAW"; } }
      else if (j?.chosen === "B") { item = b.item; chosen = "B"; }
    }
    return { item, viol: gateCheck(qtype, item, p.content), gateRetries: a.retries + b.retries, chosen, calls };
  },
  S5: async (p, qtype) => { // 생성→블라인드 검산
    const calls = [];
    let g = await genWithGate(p, qtype, "high", "", calls);
    if (!g.item) return { item: null, viol: g.viol, gateRetries: g.retries, calls };
    const s1 = await call(solvePrompt(p, qtype, g.item), "medium", 3000, "solve");
    calls.push(s1);
    const declared = (it) => (qtype === "blank" ? String(Number(it.correctAnswer)) : String(it.correctAnswer));
    const solved = (r) => { const j = r.ok ? parseJson(r.text) : null; return j ? String(qtype === "blank" ? Number(j.answer) : j.answer) : null; };
    let agree = solved(s1) === declared(g.item);
    let item = g.item;
    if (!agree) {
      const r2 = await call(genPrompt(p, qtype) + `\n\n[반려 재생성] 직전 문항은 독립 검산에서 선언 정답과 다른 답이 나왔다(정답 유일성 의심). 정답이 유일하게 성립하도록 다시 설계하라.`, "high", 16000, "regen-solve");
      calls.push(r2);
      const item2 = r2.ok ? parseJson(r2.text) : null;
      if (item2 && !gateCheck(qtype, item2, p.content).length) {
        const s2 = await call(solvePrompt(p, qtype, item2), "medium", 3000, "solve2");
        calls.push(s2);
        if (solved(s2) === declared(item2)) { item = item2; agree = true; }
      }
    }
    return { item, viol: gateCheck(qtype, item, p.content), gateRetries: g.retries, solveAgree: agree, calls };
  },
  S6: async (p, qtype) => { // medium 사고 원샷
    const calls = [];
    const g = await genWithGate(p, qtype, "medium", "", calls);
    return { item: g.item, viol: g.viol, gateRetries: g.retries, calls };
  },
  // ── stage2 확증 후보 ────────────────────────────────────────────────────────
  S2m: async (p, qtype) => { // 셀프검증 + medium 사고 (S2 품질 × S6 원가)
    const calls = [];
    const g = await genWithGate(p, qtype, "medium", SELF_VERIFY_ADDON, calls);
    return { item: g.item, viol: g.viol, gateRetries: g.retries, calls };
  },
  // S3i: 개선판 스탠다드 — 해설 품질 계약 주입 생성 + 강화 검수리 + 전체 게이트
  S3i: async (p, qtype) => {
    const calls = [];
    const g = await genWithGate(p, qtype, "high", EXPL_QUALITY_ADDON, calls);
    if (!g.item) return { item: null, viol: g.viol, gateRetries: g.retries, calls };
    const vr = await call(verifyRepairPrompt(p, qtype, g.item), "high", 18000, "verify-repair");
    calls.push(vr);
    let item = g.item, verdict = "PASS_DEFAULT";
    if (vr.ok) {
      const j = parseJson(vr.text);
      verdict = j?.verdict ?? "UNPARSED";
      if (j?.verdict === "FIXED" && j.item) {
        const fviol = gateCheck(qtype, j.item, p.content);
        if (!fviol.length) item = j.item; else verdict = "FIXED_GATE_REJECTED:" + fviol.join("|");
      }
    }
    return { item, viol: gateCheck(qtype, item, p.content), gateRetries: g.retries, verdict, calls };
  },
};
// S3g = S3 와 동일 로직(지문 무결성 가드가 gateCheck 에 추가된 상태로 재측정)
ARMS.S3g = ARMS.S3;

// ── 실행 ─────────────────────────────────────────────────────────────────────
const doneKeys = new Set();
if (fs.existsSync(OUT)) {
  for (const line of fs.readFileSync(OUT, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (r.ok) doneKeys.add(r.arm + ":" + r.p + ":" + r.qtype); } catch {}
  }
} else fs.writeFileSync(OUT, "");

const activeArms = ARM_FILTER.length ? ARM_FILTER : ["S1", "S2", "S3", "S4", "S5", "S6"];
const tasks = [];
for (const p of corpus) for (const qtype of ["blank", "grammar"]) for (const arm of activeArms) {
  if (!doneKeys.has(arm + ":" + p.idx + ":" + qtype)) tasks.push({ p, qtype, arm });
}
console.log(`arms: ${activeArms.join(",")} | tasks: ${tasks.length}`);

let done = 0;
const t00 = Date.now();
async function runTask({ p, qtype, arm }) {
  if (spent > BUDGET_USD) { fs.appendFileSync(OUT, JSON.stringify({ arm, p: p.idx, qtype, skipped: "BUDGET" }) + "\n"); return; }
  const t0 = Date.now();
  let row;
  try {
    const r = await ARMS[arm](p, qtype);
    const cost = r.calls.reduce((a, c) => a + (Number(c.costUsd) || 0), 0);
    row = {
      arm, p: p.idx, qtype, ok: !!r.item && r.viol.length === 0,
      wallMs: Date.now() - t0, costUsd: cost, callCount: r.calls.length,
      gateRetries: r.gateRetries ?? 0, viol: r.viol, verdict: r.verdict ?? null, chosen: r.chosen ?? null, solveAgree: r.solveAgree ?? null,
      calls: r.calls.map((c) => ({ label: c.label, ok: c.ok, ms: c.ms, cost: c.costUsd ?? null, rsn: c.rsn ?? null })),
      item: r.item,
    };
  } catch (e) {
    row = { arm, p: p.idx, qtype, ok: false, wallMs: Date.now() - t0, error: String(e).slice(0, 250) };
  }
  done += 1;
  fs.appendFileSync(OUT, JSON.stringify(row) + "\n");
  console.log(`[${done}/${tasks.length}] ${arm} p${p.idx} ${qtype} ${row.ok ? "OK" : "FAIL(" + (row.viol || []).join("|") + ")"} ${Math.round(row.wallMs / 1000)}s $${(row.costUsd ?? 0).toFixed(3)} | spent=$${spent.toFixed(2)}`);
}

const CONC = 5;
const queue = [...tasks];
await Promise.all(Array.from({ length: CONC }, async () => {
  while (queue.length) { const t = queue.shift(); try { await runTask(t); } catch (e) { console.log("crash", String(e).slice(0, 120)); } }
}));
console.log(`HG5 DONE in ${((Date.now() - t00) / 60000).toFixed(1)}min, spent=$${spent.toFixed(2)}`);
