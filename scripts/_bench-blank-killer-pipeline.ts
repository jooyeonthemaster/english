// 빈칸 KILLER 2콜 파이프라인 벤치 (26-08-19 O229) — 사용자 지시 "킬러는 2배 요금이니
// 제대로 2번 호출, 창조적 파이프라인 테스트". 프롬프트 단일콜 레버 포화(R1~R3) 후속.
//
// 팔:
//   scout2 : 콜1 출제 전략가(지름길 지도·후보 자리 3·에코 감사·설계 브리프) → 콜2 집필(브리프 집행)
//   adv2   : 콜1 R1 단일콜 생성 → 콜2 적대 감사관(지름길 경로 발견 시 자리 이전 재설계, 무결 시 원안 유지)
// 비교 기준: killer-v2.json 의 r1 팔(같은 12지문, 재생성 없음 — 패널 분산 통제).
//
// 사용: node_modules/.bin/tsx scripts/_bench-blank-killer-pipeline.ts [--arms scout2,adv2] [--passages ids] [--out killer-pipe.json]
import { loadEnvConfig } from "@next/env";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

loadEnvConfig(process.cwd());

const OUT_DIR = path.join(process.cwd(), "experiments/question-quality-20260715/int-tier-bench-20260819");
const args = process.argv.slice(2);
const argVal = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const ARMS = (argVal("--arms") ?? "scout2,adv2").split(/[\s,]+/).filter(Boolean);
const OUT = path.join(OUT_DIR, argVal("--out") ?? "killer-pipe.json");
const PASSAGES = (argVal("--passages") ?? "").split(/[\s,]+/).filter(Boolean);
const CONC = Number(argVal("--concurrency") ?? "8");
const G37 = "google/gemini-3.7-flash";

async function call(prompt: string, luna?: { system: string; jsonSchema: unknown }): Promise<{ text: string; ms: number; costUsd: number; finish: string | null }> {
  const key = process.env.OPENROUTER_API_KEY!;
  const t0 = Date.now();
  const body: Record<string, unknown> = {
    model: luna ? "openai/gpt-5.6-luna" : G37,
    messages: luna
      ? [{ role: "system", content: luna.system }, { role: "user", content: prompt }]
      : [{ role: "user", content: prompt }],
    max_tokens: 14_000, stream: true, usage: { include: true },
    reasoning: { enabled: true, effort: "high", exclude: false },
  };
  if (luna) {
    body.response_format = { type: "json_schema", json_schema: luna.jsonSchema };
    body.provider = { order: ["openai"], allow_fallbacks: false };
  }
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok || !res.body) throw new Error(`upstream ${res.status}`);
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = ""; let text = ""; let usage: { cost?: number } | null = null; let finish: string | null = null;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop() ?? "";
    for (const l of lines) {
      const t = l.trim(); if (!t.startsWith("data:")) continue;
      const pl = t.slice(5).trim(); if (pl === "[DONE]") continue;
      try { const j = JSON.parse(pl); const c = j.choices?.[0];
        if (c?.finish_reason) finish = c.finish_reason;
        if (c?.delta?.content) text += c.delta.content;
        if (j.usage) usage = j.usage; } catch { /* partial */ }
    }
  }
  if (!text.trim()) throw new Error(`EMPTY_BODY finish=${finish}`);
  return { text, ms: Date.now() - t0, costUsd: usage?.cost ?? 0, finish };
}

function scoutPrompt(passage: string): string {
  return `너는 대한민국 수능 영어 빈칸 추론 출제 전략가다. 아직 문항을 쓰지 마라 — 네 일은 **자리 선정과 설계 브리프**뿐이다.

## 지문
${passage}

## 작업 (반드시 이 순서, 각 단계 결과를 명시적으로 출력)
1. **재진술 지도**: 지문의 각 핵심 명제에 대해, 그 명제를 다시 말해 주는 다른 문장·절을 전부 짝지어 나열하라(예: "S2 후반 ↔ S7 전반 — 'not X but Y' 대구"). 기출 빈칸 지문이면 원래 빈칸 자리도 표시하라.
2. **후보 자리 3개**: 삭제 시 글의 기능 관계(수단→목적·원인→귀결·조건→결과·믿음/주장의 내용)가 통째로 사라지는 절 3개를 서로 다른 문장에서 골라라(12단어 이내 축자 구간). 결론 문장·첫 문장·기출 원자리는 후보 금지.
3. **에코 감사**: 각 후보에 대해 1의 지도를 참조해 같은 문장·앞뒤 문장의 재진술(에코) 유무를 판정하고, 에코 있는 후보를 지워라.
4. **최종 브리프**: 살아남은 후보 중 정답 확정에 서로 다른 문장 단서 2개+ 결합이 필요한 가장 깊은 자리 하나를 선택하고 다음을 서술하라:
   - 빈칸원문(지문 축자 그대로, 12단어 이내)
   - 정답 선지 전략: 어떤 추상화·기능 압축으로 쓸지(지문 고빈도어 재사용 금지), 정답 도달에 필요한 단서 결합 경로(몇 홉, 어느 문장들)
   - 오답 4개 설계: 각각 어떤 지름길 사용자(에코 매칭·극성 스캔·키워드 매칭·도입부 시야)를 낚을지, 지문의 어느 축자 표현을 미끼로 실을지
   - 극성 균형: 정답과 같은 극성의 근접 오답을 최소 2개 확보했는지 확인`;
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { buildMdBlankPrompt, buildBlankMdSharedSelfcheck } = await import("../src/lib/md-qgen/prompts");
  const { buildBlankPointGuidance } = await import("../src/lib/blank-point-catalog");
  const { parseMdBlank, autoSnapBlankExpression, gateMdQuestion } = await import("../src/lib/md-qgen/parser");
  const { adaptMdBlankToAiQuestion } = await import("../src/lib/md-qgen/adapter");
  const { postProcessQuestion } = await import("../src/lib/question-postprocess");
  const { shuffleQuestionOptionsForDiversity } = await import("../src/lib/question-diversity");
  const lunaMod = await import("../src/lib/md-qgen/luna-lane");

  const passages = await prisma.passage.findMany({ where: { id: { in: PASSAGES } }, select: { id: true, title: true, content: true } });
  console.log(`passages=${passages.length} arms=${ARMS.join(",")}`);

  const basePrompt = (p: string) =>
    [buildMdBlankPrompt(p, "full", "KILLER"), buildBlankPointGuidance({ pointFocus: true }), buildBlankMdSharedSelfcheck()].join("\n\n");

  const parseGate = (text: string, passage: string) => {
    try {
      const q0 = parseMdBlank(text);
      const sn = autoSnapBlankExpression(q0, passage);
      return { q: sn.question, issues: gateMdQuestion(sn.question, passage) };
    } catch (e) {
      return { q: null as unknown as ReturnType<typeof parseMdBlank>, issues: [`파싱 실패: ${e instanceof Error ? e.message : String(e)}`] };
    }
  };

  // 문항 md 재렌더(adv2 콜2 입력용) — 파싱 산출물을 다시 md 형식으로.
  const renderMd = (q: { originalExpression: string; options: Array<{ label: string; text: string }>; answer: string; explanation: string; wrong: Array<{ label: string; text: string }> }) =>
    [`빈칸원문: ${q.originalExpression}`, "", ...q.options.map((o) => `${o.label} ${o.text}`), "", `정답: ${q.answer}`, `해설: ${q.explanation}`, "오답:", ...q.wrong.map((w) => `${w.label} ${w.text}`)].join("\n");

  const rows: Array<Record<string, unknown>> = [];
  const tasks: Array<{ arm: string; p: (typeof passages)[number] }> = [];
  for (const p of passages) for (const arm of ARMS) tasks.push({ arm, p });
  let idx = 0;
  const worker = async () => {
    for (;;) {
      const t = tasks[idx++]; if (!t) return;
      const { arm, p } = t;
      const row: Record<string, unknown> = { arm, passageId: p.id, passageTitle: p.title };
      const t0 = Date.now();
      try {
        let calls: Array<{ ms: number; costUsd: number; finish: string | null }> = [];
        let finalText = "";
        if (arm === "scout2") {
          const scout = await call(scoutPrompt(p.content));
          calls.push(scout);
          row.scoutBrief = scout.text.slice(0, 4000);
          const build = await call(
            `${basePrompt(p.content)}\n\n## 선행 전략가의 설계 브리프 (필수 집행 — 자리·전략을 이 브리프대로 하라. 단 브리프가 지문 축자 규칙과 충돌하면 축자 규칙이 우선한다)\n${scout.text.slice(0, 6000)}`,
          );
          calls.push(build);
          finalText = build.text;
        } else if (arm === "precomp") {
          // O231: 결정형 자리 사전계산 주입 — 단일콜(r1 + 후보 블록). 자기검열이
          // 아니라 입력 제약(교사 포인트 기전 동형)이라 "개입→새 결함" 계통 밖.
          const { analyzeBlankSlots, buildBlankSlotBlock } = await import("../src/lib/md-qgen/blank-slot-precompute");
          const block = buildBlankSlotBlock(analyzeBlankSlots(p.content));
          row.slotBlock = block.slice(0, 1200);
          const g = await call(`${basePrompt(p.content)}${block ? `${String.fromCharCode(10)}${String.fromCharCode(10)}${block}` : ""}`);
          calls.push(g);
          finalText = g.text;
        } else if (arm === "xtour3") {
          // 교차 토너먼트(26-08-20, 사용자 제안 "3.7+luna 조합"): 모델 다양성으로
          // 독립 설계 2안을 만들고, 심판은 **선택만** 한다(수정 금지 — "개입→새 결함"
          // 패턴 원천 차단. 어젯밤 6접근 전패의 공통 사인은 재작성 개입이었다).
          const g = await call(basePrompt(p.content));
          calls.push(g);
          const l = await call(
            `${basePrompt(p.content)}

(JSON 스키마 형식으로만 응답하라)`,
            { system: lunaMod.LUNA_QGEN_SYSTEM_MESSAGE, jsonSchema: lunaMod.LUNA_BLANK_JSON_SCHEMA },
          );
          calls.push(l);
          const gq = parseGate(g.text, p.content);
          let lq: { q: unknown; issues: string[] };
          try {
            const ad = lunaMod.adaptLunaBlankJson(l.text);
            const { autoSnapBlankExpression: snap, gateMdQuestion: gate } = await import("../src/lib/md-qgen/parser");
            const sn = snap(ad.question, p.content);
            lq = { q: sn.question, issues: gate(sn.question, p.content) };
          } catch (e) { lq = { q: null, issues: [String(e)] }; }
          row.gemIssues = gq.issues; row.lunaIssues = lq.issues;
          const gMd = gq.q ? renderMd(gq.q as never) : "(게이트 반려)";
          const lMd = lq.q ? renderMd(lq.q as never) : "(게이트 반려)";
          const judge = await call(
            `너는 수능 빈칸 킬러 문항 심판이다. 같은 지문으로 만든 두 문항 중 **더 킬러다운 무결 문항 하나를 고르기만** 하라(수정 금지).

## 지문
${p.content}

## 문항 A
${gMd}

## 문항 B
${lMd}

## 판정 기준(순서대로)
1. 유효성: 정답 유일·다섯 선지 완성문 문법·해설 사실·누설 — 결함 있는 쪽 즉시 탈락.
2. 지름길: 인접 문장 에코 / 정답만 유일한 극성 / 지문 고빈도어 재사용 / 선지 형태 튐 — 지름길이 적은 쪽.
3. 유혹 오답 2개+ 와 문장 결합 요구가 더 깊은 쪽.

## 출력(딱 한 줄)
선택: A 또는 선택: B`,
          );
          calls.push(judge);
          const pick = /선택\s*[:：]\s*B/.test(judge.text) ? "B" : "A";
          row.pick = pick === "B" ? "luna" : "g37";
          finalText = pick === "B" ? "" : g.text;
          if (pick === "B") {
            // luna 선택 시 luna 산출물을 표준 md 로 재렌더해 동일 파이프 통과
            finalText = lq.q ? renderMd(lq.q as never) : l.text;
          }
        } else if (arm === "xsolve3") {
          // 교차 솔버(26-08-20): 3.7 생성 → **luna 가 학생으로 실풀이·자백**(다른
          // 모델 = 다른 맹점) → 3.7 표적 수술. solver3 과 동일 구조, 솔버만 교차.
          const first = await call(basePrompt(p.content));
          calls.push(first);
          const g1 = parseGate(first.text, p.content);
          const stem1 = g1.q ? ((g1.q as never as { passageWithBlank?: string }).passageWithBlank ?? "") : "";
          const opts1 = g1.q ? (g1.q as never as { options: Array<{ label: string; text: string }> }).options.map((o) => `${o.label} ${o.text}`).join("\n") : "";
          const SOLVE_SCHEMA = { name: "blank_solve", strict: true, schema: { type: "object", additionalProperties: false, required: ["picked", "pathHops", "shortcuts", "secondsFeel", "wouldShakeTop1pct"], properties: { picked: { type: "string" }, pathHops: { type: "string", description: "실제로 읽은 문장들과 결합 순서" }, shortcuts: { type: "array", items: { type: "string", enum: ["adjacent-echo", "polarity-unique", "keyword-match", "form-oddity", "none"] } }, secondsFeel: { type: "number" }, wouldShakeTop1pct: { type: "boolean" } } } };
          const solve = await call(
            `너는 수능 영어 1등급 컷 학생이다. 실전처럼 이 빈칸 문제를 풀어라. 정답은 모른다. 어떤 지름길을 써먹었는지 솔직히 자백하라(adjacent-echo=빈칸 앞뒤 문장이 답을 말해줌 / polarity-unique=답만 극성이 유일 / keyword-match=지문 키워드가 답에 그대로 / form-oddity=선지 형태가 튐 / none=진짜 결합 추론).

${stem1}

${opts1}`,
            { system: "형식 지시는 JSON 스키마를 따르고, 문항은 실전처럼 풀어라.", jsonSchema: SOLVE_SCHEMA },
          );
          calls.push(solve);
          row.solverTrace = solve.text.slice(0, 2000);
          const itemMd1 = g1.q ? renderMd(g1.q as never) : first.text.slice(0, 3000);
          const surgeon = await call(
            `너는 수능 빈칸 문항 외과의다. 아래 문항을 **다른 모델의 실제 학생 솔버**가 풀었고 자백 기록이 있다.

## 지문
${p.content}

## 문항
${itemMd1}

## 솔버 자백(JSON)
${solve.text.slice(0, 2000)}

## 수술 규칙
- shortcuts 에 adjacent-echo 가 있으면: 빈칸을 재진술 없는 다른 기능절로 옮겨 재설계(빈칸원문은 주어+술어 절 전체 또는 완전한 구 — 세미콜론·접속사 뒤 주어 없는 시작 금지, 다섯 완성문 낭독 검사).
- polarity-unique/keyword-match/form-oddity 만 있으면: **자리 유지**, 선지만 재설계(같은 극성 근접 오답 2개+, 키워드는 오답으로, 형태 균질).
- none 이고 wouldShakeTop1pct=true 면: 원안 그대로 출력.

## 출력 형식(이 형식만)
빈칸원문: <지문 축자 그대로>

① <선지>
② <선지>
③ <선지>
④ <선지>
⑤ <선지>

정답: <①~⑤ 하나>
해설: <1~2문장, 합니다체>
오답:
① <왜 탈락인지 1문장> (정답 번호 제외 4개)
...`,
          );
          calls.push(surgeon);
          finalText = surgeon.text;
          row.firstPassIssues = g1.issues;
        } else if (arm === "solver3") {
          // O229-b(26-08-19 밤): 솔버-인-더-루프 — 지름길을 상상시키지 않고 실제로
          // 푸는 걸 관찰해 뚫린 지점만 수술한다(패널에서 솔버가 최정확 신호였던
          // 방법론을 생성 파이프라인 내부로 이식).
          const first = await call(basePrompt(p.content));
          calls.push(first);
          const g1 = parseGate(first.text, p.content);
          const opts = g1.q ? (g1.q as never as { options: Array<{ label: string; text: string }> }).options.map((o) => `${o.label} ${o.text}`).join("\n") : "";
          const stem = g1.q ? (g1.q as never as { passageWithBlank?: string }).passageWithBlank ?? "" : "";
          const solve = await call(
            `너는 수능 영어 1등급 컷 학생이다. 실전처럼 이 빈칸 문제를 풀어라. 정답은 모른다.

${stem}

${opts}

## 출력(솔직하게)
- 고른 답: <①~⑤>
- 풀이 경로: 실제로 읽은 문장들과 결합 순서(몇 홉이었는지)
- 지름길 자백: 다음 중 써먹은 것 전부 — (a) 빈칸 앞뒤 문장이 답을 거의 말해줘서 (b) 답만 극성/방향이 유일해서 (c) 지문 키워드가 답에 그대로 있어서 (d) 선지 형태(길이·추상도)가 튀어서 (e) 없음, 진짜 결합 추론으로 풀었음
- 체감: 몇 초컷이었는지, 상위권이 흔들릴 문제인지`,
          );
          calls.push(solve);
          row.solverTrace = solve.text.slice(0, 3000);
          const itemMd = g1.q ? renderMd(g1.q as never) : first.text.slice(0, 3000);
          const surgeon = await call(
            `너는 수능 빈칸 문항 외과의다. 아래 문항을 실제 상위권 솔버가 풀었고, 그 풀이 경로가 기록돼 있다.

## 지문
${p.content}

## 문항
${itemMd}

## 솔버의 실제 풀이 기록
${solve.text.slice(0, 3000)}

## 수술 규칙
- 솔버가 지름길 (a)를 자백했으면: 빈칸 자리를 재진술 없는 다른 기능절로 옮겨 재설계하라. **빈칸 경계 규칙 필수**: 빈칸원문은 주어+술어를 갖춘 절 전체이거나 완전한 동사구/명사구 전체 — 세미콜론·접속사 바로 뒤에서 주어 없이 시작 금지. 재설계 후 다섯 선지를 각각 대입한 완성문 다섯 개를 속으로 낭독해 전부 문법적인지 확인하라.
- 지름길 (b)/(c)/(d)만 자백했으면: **자리는 유지**하고 선지만 재설계하라 — 정답과 같은 극성의 근접 오답 2개 추가, 키워드는 오답으로 이동, 형태(길이·추상도) 균질화.
- (e) 진짜 결합 추론이었고 흔들릴 문제라 했으면: 원안을 그대로 출력하라.

## 출력 형식(수술 여부 무관 이 형식만, 수술 소견 출력 금지)
빈칸원문: <지문 축자 그대로>

① <선지>
② <선지>
③ <선지>
④ <선지>
⑤ <선지>

정답: <①~⑤ 하나>
해설: <1~2문장, 합니다체>
오답:
① <왜 탈락인지 1문장> (정답 번호 제외 4개)
...`,
          );
          calls.push(surgeon);
          finalText = surgeon.text;
          row.firstPassIssues = g1.issues;
        } else if (arm === "multi5") {
          // 사용자 제안 구조(26-08-19): 여러 포인트를 뽑고 → 최고 난이도 자리를 선택 → 생성.
          const cand = await call(
            `너는 수능 빈칸 출제 전략가다. 아직 완제품을 쓰지 마라.

## 지문
${p.content}

## 작업
서로 다른 문장에서 빈칸 후보 자리 **5개**를 뽑아, 각 후보마다 다음 미니 설계를 써라:
- 빈칸원문(지문 축자 그대로, 12단어 이내)
- 정답 컨셉(어떤 추상 패러프레이즈로 쓸지 한 줄)
- 킬러 경로: 정답 확정에 어느 문장 단서 몇 개의 결합이 필요한지
- 에코 판정: 같은 문장·바로 앞뒤 문장에 이 내용의 재진술이 있는지(있으면 어디인지 축자 인용)
- 예상 난이도 1~5점과 그 근거

5개 후보는 지문 앞·중·뒤에 분산하고, 기출 원자리·첫 문장·결론 문장도 일단 포함해도 된다(점수에서 불리할 뿐).`,
          );
          calls.push(cand);
          row.candidates = cand.text.slice(0, 5000);
          const build = await call(
            `${basePrompt(p.content)}

## 후보 자리 5개 (선행 전략가 산출)
${cand.text.slice(0, 7000)}

## 추가 지시 (필수)
위 5개 후보를 심사하라: 에코가 있는 후보는 탈락, 남은 것 중 킬러 경로가 가장 깊은(서로 다른 문장 단서 결합이 가장 많이 필요한) 자리 하나를 선택하고, **그 자리로** 완제품을 설계하라. 심사 과정은 출력하지 말고 완제품만 출력 형식대로 내라.`,
          );
          calls.push(build);
          finalText = build.text;
        } else {
          // adv2
          const first = await call(basePrompt(p.content));
          calls.push(first);
          const g1 = parseGate(first.text, p.content);
          const itemMd = g1.q ? renderMd(g1.q as never) : first.text.slice(0, 3000);
          const attack = await call(
            `너는 수능 빈칸 문항의 적대 감사관이자 재설계자다.\n\n## 지문\n${p.content}\n\n## 심사 대상 문항\n${itemMd}\n\n## 작업\n1. 상위 1% 학생이 이 문항을 **지름길로 푸는 경로**를 찾아라: ① 빈칸 같은 문장·앞뒤 문장의 재진술(에코)로 즉답 ② 정답만 유일한 극성 ③ 정답의 지문 고빈도어 재사용(키워드 매칭) ④ 빈칸 문장 내부 단서만으로 확정.\n2-A. **경로를 하나라도 찾았으면**: 그 자리를 버리고, 재진술이 없는 다른 기능절(삭제 시 수단→목적·원인→귀결·믿음 내용이 사라지는 절, 12단어 이내 축자)로 빈칸을 옮겨 **완전히 새 문항을 재설계**하라. 정답은 추상 패러프레이즈, 발견한 지름길 어휘들은 오답에 미끼로 심어라.\n2-B. **경로가 없으면**: 원 문항을 그대로 다시 출력하라.\n\n## 출력 형식 (재설계든 유지든 이 형식만, 감사 내용은 출력하지 마라)\n빈칸원문: <지문 축자 그대로>\n\n① <선지>\n② <선지>\n③ <선지>\n④ <선지>\n⑤ <선지>\n\n정답: <①~⑤ 하나>\n해설: <1~2문장, 합니다체>\n오답:\n① <왜 탈락인지 1문장> (정답 번호 제외 4개)\n...`,
          );
          calls.push(attack);
          finalText = attack.text;
          row.firstPassIssues = g1.issues;
        }
        let parsed = parseGate(finalText, p.content);
        row.attempts = calls.map((c) => ({ ms: c.ms, costUsd: c.costUsd, finish: c.finish }));
        if (parsed.issues.length > 0) {
          // 프로덕션 동일 재생성 1회(집필 콜만)
          const fb = `\n\n[반려 재생성] 직전 출력이 기계 검사에서 반려되었다: ${parsed.issues.join(", ")}. 위반을 전부 해소하고 같은 요구사항으로 완제품을 다시 설계하라(지문 본문 수정 금지).`;
          const retry = await call((arm === "scout2" ? `${basePrompt(p.content)}\n\n## 선행 전략가의 설계 브리프\n${String(row.scoutBrief)}` : basePrompt(p.content)) + fb);
          calls.push(retry);
          const rp = parseGate(retry.text, p.content);
          if (rp.issues.length <= parsed.issues.length) { parsed = rp; finalText = retry.text; }
        }
        row.finalPass = parsed.issues.length === 0;
        row.finalGateIssues = parsed.issues;
        row.rawText = finalText;
        if (row.finalPass && parsed.q) {
          const ad = adaptMdBlankToAiQuestion(parsed.q as never, p.content, "KILLER", "PARAPHRASE");
          if (ad.ok && ad.aiQuestion) {
            const pp = postProcessQuestion("BLANK_INFERENCE", p.content, ad.aiQuestion);
            const mapped = { ...((pp.success && pp.data ? pp.data : ad.aiQuestion) as Record<string, unknown>), _typeId: "BLANK_INFERENCE", difficulty: "KILLER" };
            row.aiQuestion = shuffleQuestionOptionsForDiversity(mapped, "BLANK_INFERENCE");
          } else row.adaptError = ad.error;
        }
        row.totalCostUsd = calls.reduce((s, c) => s + c.costUsd, 0);
        row.totalDurationMs = Date.now() - t0;
        console.log(`${arm.padEnd(7)} ${p.title.slice(0, 26).padEnd(26)} pass=${row.finalPass ? "Y" : "N"} calls=${calls.length} ${Math.round((row.totalDurationMs as number) / 1000)}s ₩${((row.totalCostUsd as number) * 1350).toFixed(1)}${row.finalPass ? "" : " | " + (row.finalGateIssues as string[]).join("; ").slice(0, 100)}`);
      } catch (e) {
        row.error = e instanceof Error ? e.message : String(e);
        console.log(`${arm.padEnd(7)} ${p.title.slice(0, 26)} ERROR ${String(row.error).slice(0, 120)}`);
      }
      rows.push(row);
    }
  };
  await Promise.all(Array.from({ length: CONC }, () => worker()));
  writeFileSync(OUT, JSON.stringify({ generatedAt: "2026-08-19", arms: ARMS, rows }, null, 1));
  console.log(`saved ${OUT} rows=${rows.length}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
