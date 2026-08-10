// 마크다운 원큐 실측 — grok4.5, 공예 강제 + 초간단 해설 + 스키마 없는 마크다운 출력.
// 비교 대상: 동일 지문 JSON 원큐(oneshot-results.json — grok 빈칸 56~108s, 어법 99~106s).
// 파싱은 결정형 정규식 + 축자 게이트(0원)로 검증한다.
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

function blankPrompt(passage) {
  return `너는 대한민국 수능 영어영역을 20년 출제해 온 최정상 출제위원이다. 아래 지문으로 '빈칸 추론' KILLER 문항 1개를 설계하라. 선지 다섯 개 하나하나에 명확한 출제 의도가 박힌 아름다운 킬러 문항이어야 한다. 학생이 어느 지점에서 흔들릴지를 계산하고 학생 머리 꼭대기에서 설계하라.

## 설계 규칙
- 빈칸은 글의 핵심 논지가 수렴하는 자리. 빈칸 문장만 읽고 풀리면 실패 — 서로 다른 근거 문장 2개 이상을 종합해야 정답이 나오게.
- 정답은 원문 표면 어휘를 재사용하지 않는 추상 패러프레이즈.
- 오답 4개는 서로 다른 기제(중복 금지): ①방향반대(필수·최매력 — 앞부분은 글의 핵심어구 그대로, 뒷부분에서 논지를 뒤집거나 지엽 결합) ②도입부함정(논지 전환 이전에 시야가 갇힌 학생용) ③범위확대 또는 세부확대 ④근거없음(통념형).
- 절대 표현(completely·never 류)을 오답에만 몰지 마라. 선지 길이·구조 균형.
- 빈칸원문은 지문 축자(한 글자도 변경 금지), 문장 통째 삼킴 금지.

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
빈칸원문: <지문에서 뚫을 원문 구>
① <선지>
② <선지>
③ <선지>
④ <선지>
⑤ <선지>
정답: <①~⑤ 하나>
해설: <딱 2문장 — 근거 문장 연결과 정답 도출만. 합니다체>
오답:
① <기제이름 — 왜 매력적이고 왜 탈락인지 1문장> (정답 번호는 제외하고 오답 4개만)
...

## 지문
${passage}`;
}

function grammarPrompt(passage) {
  return `너는 대한민국 수능 영어 어법 문항을 20년 출제해 온 최정상 출제위원이다. 아래 지문으로 밑줄 5개 '어법상 틀린 것' KILLER 문항 1개를 설계하라. 밑줄 하나하나에 명확한 의도를 담고 절대 겹치지 않게, 학생이 무엇과 헷갈릴지 정확히 계산하라.

## 설계 규칙
- 출제 포인트는 핵심 10선에서만: (a)정동사vs준동사 (b)관계사 (c)분사 (d)수일치 (e)태 (f)형부 (g)대명사 (h)목적격보어 (i)병렬 (k)to-v/v-ing. 정답 포인트는 반드시 이 10선. 5개 포인트 서로 다르게 분산.
- 정답은 장거리 구조 단서(진짜 주어 핵·선행사·병렬 시작점)가 필요한 복잡한 문장에. 인접 수일치·who/which 단순교체·한눈 비문 금지.
- 미끼 4개는 원문 그대로 두되 학생이 실제 고민하는 자리만(장식 금지).
- 원문표현은 전부 지문 축자(1~3단어). 정답 자리만 오형으로 표시.

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
밑줄:
(A) <원문표현> | <표시형: 정답만 오형, 나머지는 원문과 동일> | <포인트코드 a~k>
(B) ...
(C) ...
(D) ...
(E) ...
정답: <(A)~(E) 하나>
고침: <정답 자리를 고친 원형>
해설: <딱 2문장 — 구조 근거와 왜 비문인지만. 합니다체>
오답:
(A) <학생이 헷갈리는 지점 + 왜 옳은지 1문장> (정답 라벨 제외 4개만)
...

## 지문
${passage}`;
}

// ── 결정형 마크다운 파서 ─────────────────────────────────────────────────────
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
function parseBlank(text) {
  const oe = text.match(/^빈칸원문:\s*(.+)$/m)?.[1];
  const options = [...text.matchAll(/^([①②③④⑤])\s*(.+)$/gm)]
    .filter((m) => !/^[①②③④⑤]\s*(방향반대|도입부|범위확대|세부확대|근거없음)/.test(m[0]) || false)
    .map((m) => ({ label: m[1], text: m[2].trim() }));
  const answer = text.match(/^정답:\s*([①②③④⑤])/m)?.[1];
  const expl = text.match(/^해설:\s*([\s\S]*?)(?=^오답:|\n오답:)/m)?.[1];
  const wrongSection = text.split(/^오답:\s*$/m)[1] ?? text.split(/\n오답:\s*\n/)[1] ?? "";
  const wrong = [...wrongSection.matchAll(/^([①②③④⑤])\s*(.+)$/gm)].map((m) => ({ label: m[1], text: m[2].trim() }));
  // 선지 5개는 오답 섹션 이전에서만 취한다(라벨 중복 방지).
  const before = text.split(/^오답:/m)[0];
  const opts = [...before.matchAll(/^([①②③④⑤])\s*(.+)$/gm)].map((m) => ({ label: m[1], text: m[2].trim() }));
  return { originalExpression: oe?.trim(), options: opts, answer, explanation: expl?.trim(), wrong };
}
function parseGrammar(text) {
  const before = text.split(/^오답:/m)[0];
  const marks = [...before.matchAll(/^\((A|B|C|D|E)\)\s*(.+?)\s*\|\s*(.+?)\s*\|\s*([a-k])\s*$/gm)]
    .map((m) => ({ label: `(${m[1]})`, original: m[2].trim(), shown: m[3].trim(), code: m[4] }));
  const answer = text.match(/^정답:\s*(\([A-E]\))/m)?.[1];
  const fix = text.match(/^고침:\s*(.+)$/m)?.[1];
  const expl = text.match(/^해설:\s*([\s\S]*?)(?=^오답:|\n오답:)/m)?.[1];
  const wrongSection = text.split(/^오답:\s*$/m)[1] ?? "";
  const wrong = [...wrongSection.matchAll(/^\(([A-E])\)\s*(.+)$/gm)].map((m) => ({ label: `(${m[1]})`, text: m[2].trim() }));
  return { marks, answer, fix: fix?.trim(), explanation: expl?.trim(), wrong };
}
function gate(qtype, item, passage) {
  const v = [];
  const pn = norm(passage);
  if (qtype === "blank") {
    if (!item.originalExpression) v.push("NO_OE");
    else if (!pn.includes(norm(item.originalExpression))) v.push("NOT_VERBATIM");
    if (item.options.length !== 5) v.push(`OPTIONS_${item.options.length}`);
    if (!item.answer) v.push("NO_ANSWER");
    if (!item.explanation) v.push("NO_EXPL");
    if (item.wrong.length !== 4) v.push(`WRONG_${item.wrong.length}`);
  } else {
    if (item.marks.length !== 5) return [`MARKS_${item.marks.length}`];
    for (const m of item.marks) if (!pn.includes(norm(m.original))) v.push(`NV:${m.label}`);
    const changed = item.marks.filter((m) => norm(m.shown) !== norm(m.original));
    if (changed.length !== 1) v.push(`CHANGED_${changed.length}`);
    else if (changed[0].label !== item.answer) v.push("ANSWER_LABEL_MISMATCH");
    if (!item.fix) v.push("NO_FIX");
    if (!item.explanation) v.push("NO_EXPL");
    if (item.wrong.length !== 4) v.push(`WRONG_${item.wrong.length}`);
  }
  return v;
}

async function call(prompt) {
  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "x-ai/grok-4.5",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 6000, stream: false, usage: { include: true },
      reasoning: { enabled: true, effort: "high", exclude: true },
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const json = await res.json().catch(() => null);
  const ms = Date.now() - t0;
  if (!res.ok || !json || json.error) return { ok: false, ms, error: JSON.stringify(json?.error ?? {}).slice(0, 120) };
  const u = json.usage ?? {};
  return {
    ok: true, ms, cost: u.cost ?? 0,
    outTok: u.completion_tokens ?? null,
    rsnTok: u.completion_tokens_details?.reasoning_tokens ?? null,
    text: json.choices?.[0]?.message?.content ?? "",
  };
}

const tasks = [];
for (const p of passages) for (const qtype of ["blank", "grammar"]) tasks.push({ p, qtype });
const out = [];
await Promise.all(Array.from({ length: 3 }, async () => {
  while (tasks.length) {
    const t = tasks.shift(); if (!t) break;
    const r = await call(t.qtype === "blank" ? blankPrompt(t.p.content) : grammarPrompt(t.p.content));
    let viol = ["CALL_FAIL"]; let item = null;
    if (r.ok) {
      item = t.qtype === "blank" ? parseBlank(r.text) : parseGrammar(r.text);
      viol = gate(t.qtype, item, t.p.content);
    }
    const row = { qtype: t.qtype, p: t.p.idx, sec: Math.round(r.ms / 1000), krw: Math.round((r.cost ?? 0) * 1400), outTok: r.outTok, rsnTok: r.rsnTok, viol, raw: r.text, item };
    out.push(row);
    console.log(JSON.stringify({ ...row, raw: undefined, item: undefined }));
  }
}));
fs.writeFileSync(path.join(HERE, "md-oneshot-results.json"), JSON.stringify(out, null, 1));
const agg = {};
for (const r of out) (agg[r.qtype] = agg[r.qtype] || []).push(r.sec);
console.log("\n요약(초):", JSON.stringify(Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, v.sort((a, b) => a - b).join("/")]))));
