// 심플 스택 원큐 속도 실측 — grok4.5 vs flash3, 공예 프롬프트 + 최소 스키마 + 0원 게이트만.
// 파이프라인 없음: 1콜 → 파싱 → 축자 검사 → 기록. 끝.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const KEY = process.env.OPENROUTER_API_KEY;

const corpus = JSON.parse(fs.readFileSync(path.join(HERE, "..", "hg5-standard-spec", "hg3-corpus.json"), "utf8"));
const passages = corpus.filter((p) => [1, 12, 19].includes(p.idx));

// 공예 프롬프트 본문(craft-prompts.mts와 동일 방법론) + 최소 스키마 계약
const BLANK_MIN_SCHEMA = `출력(JSON만): {"direction":"발문","originalExpression":"지문에서 빈칸으로 뚫을 원문 구(축자)","options":[{"label":1,"text":"..."},...5개],"correctAnswer":1~5,"explanation":"해설 3~4문장(합니다체)","wrongOptionExplanations":{"오답라벨":"기제 이름: 1문장",...4개}}`;
const GRAMMAR_MIN_SCHEMA = `출력(JSON만): {"direction":"발문","markedExpressions":[{"label":"(A)","expression":"원문 축자 1~3단어","isError":false,"errorExpression":null,"correction":null,"pointCode":"a~k"},...5개(정답 1개만 isError:true+errorExpression+correction)],"correctAnswer":"(X)","explanation":"3~4문장","wrongOptionExplanations":{"(A)":"1문장",...4개}}`;

const craftSrc = fs.readFileSync(path.join(HERE, "craft-prompts.mts"), "utf8");
// craft-prompts.mts 를 tsx 없이 재사용하기 위해 본문 텍스트를 추출하지 않고,
// 같은 방법론 블록을 여기 인라인(동일 문구 유지가 목적이 아니라 동일 방법론).
function blankPrompt(passage) {
  return `너는 대한민국 수능 영어영역을 20년 출제해 온 최정상 출제위원이다. 아래 지문으로 '빈칸 추론' KILLER 문항 1개를 설계하라. 선지 다섯 개 하나하나에 명확한 출제 의도가 박힌 아름다운 킬러 문항이어야 한다.

## 오답 4개 — 각각 다른 기제(중복 금지)
1. 방향반대(필수, 최매력): 앞부분에 글의 주제어·핵심어구를 그대로 포함시켜 정답처럼 보이게 하고, 뒷부분에서 논지를 뒤집거나 지엽 정보를 결합(범위확대·세부확대 결합 시 극대화).
2. 도입부 함정: 논지 전환 이전 도입부에 시야가 갇힌 학생이 고르는 선지.
3. 범위확대 또는 세부사항확대. 4. 근거없음(통념형).
- 절대 표현을 오답에만 몰지 마라(요령 소거 노출 금지). 선지 길이·구조 균형.
- 빈칸은 핵심 논지 수렴 자리. 정답은 원문 표면 어휘 재사용 없는 추상 패러프레이즈.
- originalExpression 은 지문 축자, 문장 통째 삼킴 금지, 빈칸 뒤 의존 잔여구문 금지.

${BLANK_MIN_SCHEMA}

## 지문
${passage}`;
}
function grammarPrompt(passage) {
  return `너는 대한민국 수능 영어 어법 문항을 20년 출제해 온 최정상 출제위원이다. 아래 지문으로 밑줄 5개 '어법상 틀린 것' KILLER 문항 1개를 설계하라. 밑줄 하나하나에 의도를 담고 절대 겹치지 않게.

## 출제 포인트 — 핵심 10선: (a)정동사vs준동사 (b)관계사 (c)분사 (d)수일치 (e)태 (f)형부 (g)대명사 (h)목적격보어 (i)병렬 (k)to-v/v-ing
- 정답은 반드시 이 10선. 포인트 5개 서로 다르게 분산. 정답은 장거리 구조 단서(진짜 주어 핵·선행사·병렬 시작점)가 필요한 복잡한 문장에. 인접 수일치·who/which 단순교체·한눈 비문 금지.
- 미끼 4개는 원문 그대로, 학생이 실제 고민하는 자리만(장식 금지). expression 전부 지문 축자.

${GRAMMAR_MIN_SCHEMA}

## 지문
${passage}`;
}

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
function gate(qtype, item, passage) {
  const v = [];
  const pn = norm(passage);
  if (!item) return ["PARSE_FAIL"];
  if (qtype === "blank") {
    const oe = norm(item.originalExpression);
    if (!oe || !pn.includes(oe)) v.push("NOT_VERBATIM");
    if (!Array.isArray(item.options) || item.options.length !== 5) v.push("OPTIONS");
  } else {
    const ms = item.markedExpressions;
    if (!Array.isArray(ms) || ms.length !== 5) return ["MARKERS"];
    for (const m of ms) if (!pn.includes(norm(m.expression))) v.push("NV:" + m.label);
    if (ms.filter((m) => m.isError === true).length !== 1) v.push("ANSWER_COUNT");
  }
  return v;
}

async function call(model, prompt, effort) {
  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, messages: [{ role: "user", content: prompt }],
      max_tokens: 12000, stream: false, usage: { include: true },
      reasoning: { enabled: true, effort, exclude: true },
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const json = await res.json().catch(() => null);
  const ms = Date.now() - t0;
  if (!res.ok || !json || json.error) return { ok: false, ms, error: JSON.stringify(json?.error ?? {}).slice(0, 120) };
  let t = (json.choices?.[0]?.message?.content ?? "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "");
  const s = t.indexOf("{"); if (s > 0) t = t.slice(s);
  let item = null; try { item = JSON.parse(t); } catch { const e = t.lastIndexOf("}"); if (e > 0) { try { item = JSON.parse(t.slice(0, e + 1)); } catch {} } }
  return { ok: true, ms, cost: json.usage?.cost ?? 0, item };
}

const MODELS = process.env.ONESHOT_PRO31 === "1"
  ? [["google/gemini-3.1-pro-preview", "medium"]]
  : [["x-ai/grok-4.5", "high"], ["google/gemini-3-flash-preview", "high"]];
const tasks = [];
for (const p of passages) for (const qtype of ["blank", "grammar"]) for (const [model, effort] of MODELS) tasks.push({ p, qtype, model, effort });

const out = [];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (tasks.length) {
    const t = tasks.shift(); if (!t) break;
    const prompt = t.qtype === "blank" ? blankPrompt(t.p.content) : grammarPrompt(t.p.content);
    const r = await call(t.model, prompt, t.effort);
    const viol = r.ok ? gate(t.qtype, r.item, t.p.content) : ["CALL_FAIL:" + (r.error ?? "")];
    const row = { model: t.model.split("/")[1], qtype: t.qtype, p: t.p.idx, sec: Math.round(r.ms / 1000), krw: Math.round((r.cost ?? 0) * 1400), viol };
    out.push(row);
    console.log(JSON.stringify(row));
  }
}));
fs.writeFileSync(path.join(HERE, process.env.ONESHOT_PRO31 === "1" ? "oneshot-pro31.json" : "oneshot-results.json"), JSON.stringify(out, null, 1));
const agg = {};
for (const r of out) { const k = r.model + " " + r.qtype; (agg[k] = agg[k] || []).push(r.sec); }
console.log("\n요약(초):", JSON.stringify(Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, v.sort((a, b) => a - b).join("/")]))));
