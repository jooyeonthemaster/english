// md 다중 형식 실콜 매트릭스 (26-07-23 스펙 v1 — U5 검증)
// DB 실지문(기출) 1개로 {빈칸2 PARA, 빈칸3 PARA, 빈칸2 SOURCE_EXACT, 어법7·2,
// 어법10·3} 각 1콜 — 프롬프트→파서→스냅→게이트→어댑터→postProcessQuestion→
// validateQuestionQuality(실카운트) 전체 파이프라인 통과를 실증하고 형상을
// 스팟체크한다. 모델·파라미터는 md-stream 라우트 동일(flash3·reasoning high·14k).
// 실행: npx tsx scripts/_bench-md-multi-live.ts [케이스키 ...]
//   케이스키: blank2-para blank3-para blank2-exact grammar7x2 grammar10x3 (생략=전부)
import { config } from "dotenv";
import { resolve } from "path";
import { mkdirSync, writeFileSync } from "fs";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const MODEL = "google/gemini-3-flash-preview";
const OUT_DIR =
  process.env.MD_MULTI_OUT ??
  "experiments/question-quality-20260715/md-multi-live-20260723";

interface CaseDef {
  key: string;
  label: string;
  type: "BLANK_INFERENCE" | "GRAMMAR_ERROR";
  blankCount?: 2 | 3;
  answerMode?: "PARAPHRASE" | "SOURCE_EXACT";
  markerCount?: number;
  answerCount?: number;
}

const CASES: CaseDef[] = [
  { key: "blank2-para", label: "빈칸2 PARAPHRASE", type: "BLANK_INFERENCE", blankCount: 2, answerMode: "PARAPHRASE" },
  { key: "blank3-para", label: "빈칸3 PARAPHRASE", type: "BLANK_INFERENCE", blankCount: 3, answerMode: "PARAPHRASE" },
  { key: "blank2-exact", label: "빈칸2 SOURCE_EXACT", type: "BLANK_INFERENCE", blankCount: 2, answerMode: "SOURCE_EXACT" },
  { key: "grammar7x2", label: "어법 7마커·2정답", type: "GRAMMAR_ERROR", markerCount: 7, answerCount: 2 },
  { key: "grammar10x3", label: "어법 10마커·3정답", type: "GRAMMAR_ERROR", markerCount: 10, answerCount: 3 },
];

interface RowResult {
  key: string;
  label: string;
  durationMs: number;
  costUsd: number | null;
  gate: string; // "PASS" | 반려 사유
  corrections: string[];
  adapter: string; // "PASS" | 실패 사유
  postprocess: string; // "PASS" | 실패 사유
  ppWarnings: string[];
  validateErrors: string[];
  validateWarnings: string[];
  spotChecks: Array<{ name: string; ok: boolean; detail: string }>;
  error?: string;
  rawText?: string;
}

async function callModel(prompt: string): Promise<{
  text: string;
  durationMs: number;
  costUsd: number | null;
}> {
  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 14000,
      reasoning: { enabled: true, effort: "high", exclude: true },
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`${MODEL} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { cost?: number };
  };
  const text = json?.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("모델이 본문 출력을 내지 않았습니다.");
  return {
    text,
    durationMs: Date.now() - t0,
    costUsd: typeof json?.usage?.cost === "number" ? json.usage.cost : null,
  };
}

function englishRatio(s: string): number {
  if (!s) return 0;
  const letters = s.replace(/[^A-Za-z .,;'"()-]/g, "").length;
  return letters / s.length;
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { buildMdMultiBlankPrompt, buildMdGrammarPrompt } = await import(
    "../src/lib/md-qgen/prompts"
  );
  const {
    parseMdMultiBlank,
    parseMdGrammar,
    autoSnapMultiBlankExpressions,
    autoSnapGrammarMarks,
    gateMdMultiBlank,
    gateMdQuestion,
  } = await import("../src/lib/md-qgen/parser");
  const { adaptMdMultiBlankToAiQuestion, adaptMdGrammarToAiQuestion } = await import(
    "../src/lib/md-qgen/adapter"
  );
  const { postProcessQuestion } = await import("../src/lib/question-postprocess");
  const { validateQuestionQuality } = await import("../src/lib/question-quality");

  // ── DB 실지문(기출) 1개 — 영어 지문·적정 길이 우선, 폴백 사슬 ──────────────
  const candidates = await prisma.passage.findMany({
    where: { title: { contains: "영어" }, content: { not: "" } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, title: true, content: true },
  });
  let picked = candidates.find(
    (p) => p.content.length >= 700 && p.content.length <= 2600 && englishRatio(p.content) > 0.8,
  );
  if (!picked) {
    const fallback = await prisma.passage.findMany({
      where: { content: { not: "" } },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, title: true, content: true },
    });
    picked = fallback.find(
      (p) => p.content.length >= 700 && p.content.length <= 2600 && englishRatio(p.content) > 0.8,
    );
  }
  if (!picked) {
    console.error("적합한 영어 지문을 찾지 못했습니다.");
    await prisma.$disconnect();
    process.exit(1);
  }
  const passage = picked;
  console.log(`지문: ${passage.title?.slice(0, 60)} (${passage.content.length}자, id=${passage.id})\n`);

  const onlyKeys = process.argv.slice(2);
  const targets = onlyKeys.length > 0 ? CASES.filter((c) => onlyKeys.includes(c.key)) : CASES;
  if (targets.length === 0) {
    console.error(`케이스키 불일치: ${onlyKeys.join(", ")} — 가능: ${CASES.map((c) => c.key).join(", ")}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  async function runCase(def: CaseDef): Promise<RowResult> {
    const row: RowResult = {
      key: def.key,
      label: def.label,
      durationMs: 0,
      costUsd: null,
      gate: "-",
      corrections: [],
      adapter: "-",
      postprocess: "-",
      ppWarnings: [],
      validateErrors: [],
      validateWarnings: [],
      spotChecks: [],
    };
    const spot = (name: string, ok: boolean, detail: string) =>
      row.spotChecks.push({ name, ok, detail });
    try {
      const prompt =
        def.type === "BLANK_INFERENCE"
          ? buildMdMultiBlankPrompt(passage.content, "full", "KILLER", def.blankCount!, def.answerMode!)
          : buildMdGrammarPrompt(passage.content, "full", "KILLER", {
              markerCount: def.markerCount,
              answerCount: def.answerCount,
            });
      const call = await callModel(prompt);
      row.durationMs = call.durationMs;
      row.costUsd = call.costUsd;
      row.rawText = call.text;

      let aiQuestion: Record<string, unknown> | undefined;
      if (def.type === "BLANK_INFERENCE") {
        let q = parseMdMultiBlank(call.text);
        const snapped = autoSnapMultiBlankExpressions(q, passage.content);
        q = snapped.question;
        row.corrections = snapped.corrections;
        const gate = gateMdMultiBlank(q, passage.content, { blankCount: def.blankCount });
        row.gate = gate.length === 0 ? "PASS" : gate.join("; ");
        if (gate.length > 0) return row;
        const adapt = adaptMdMultiBlankToAiQuestion(q, passage.content, "KILLER", def.answerMode!);
        row.adapter = adapt.ok ? "PASS" : (adapt.error ?? "unknown");
        if (!adapt.ok || !adapt.aiQuestion) return row;
        aiQuestion = adapt.aiQuestion;
      } else {
        let q = parseMdGrammar(call.text);
        const snapped = autoSnapGrammarMarks(q, passage.content);
        q = snapped.question;
        row.corrections = snapped.corrections;
        const gate = gateMdQuestion(q, passage.content, {
          markerCount: def.markerCount,
          answerCount: def.answerCount,
        });
        row.gate = gate.length === 0 ? "PASS" : gate.join("; ");
        if (gate.length > 0) return row;
        const adapt = adaptMdGrammarToAiQuestion(q, passage.content, "KILLER");
        row.adapter = adapt.ok ? "PASS" : (adapt.error ?? "unknown");
        if (!adapt.ok || !adapt.aiQuestion) return row;
        aiQuestion = adapt.aiQuestion;
      }

      const pp = postProcessQuestion(def.type, passage.content, aiQuestion);
      row.postprocess = pp.success ? "PASS" : (pp.error ?? "unknown");
      row.ppWarnings = pp.warnings ?? [];
      if (!pp.success || !pp.data) return row;
      const d = pp.data as Record<string, unknown>;

      // ── validateQuestionQuality — md-stream 라우트와 동일한 실카운트 주입 ──
      const issues = validateQuestionQuality({
        typeId: def.type,
        question: { ...d, difficulty: "KILLER" },
        passage: passage.content,
        requestedDifficulty: "KILLER",
        ...(def.type === "GRAMMAR_ERROR"
          ? { grammarMarkerCount: def.markerCount, grammarAnswerCount: def.answerCount }
          : {
              blankInferenceBlankCount: def.blankCount,
              blankInferenceParaphraseAnswer: def.answerMode === "PARAPHRASE",
            }),
      });
      row.validateErrors = issues.filter((i) => i.severity === "error").map((i) => i.code);
      row.validateWarnings = issues.filter((i) => i.severity === "warning").map((i) => i.code);

      // ── 형상 스팟체크 ────────────────────────────────────────────────────
      if (def.type === "BLANK_INFERENCE") {
        const blanks = (d.blanks ?? []) as Array<{ label: string; originalExpression: string }>;
        const labels = blanks.map((b) => b.label);
        const pwb = String(d.passageWithBlank ?? "");
        spot(
          `passageWithBlank 마커 ${labels.join("")}`,
          labels.length === def.blankCount && labels.every((l) => pwb.includes(`${l} _____`)),
          labels.map((l) => `${l}:${pwb.includes(`${l} _____`) ? "있음" : "없음"}`).join(" "),
        );
        const opts = (d.options ?? []) as Array<{ label: string; blankValues: string[] }>;
        const correct = opts.find((o) => o.label === d.correctAnswer);
        const src = blanks.map((b) => b.originalExpression.toLowerCase());
        const verbatimFlags = (correct?.blankValues ?? []).map(
          (v, i) => v.replace(/\s+/g, " ").trim().toLowerCase() === src[i],
        );
        if (def.answerMode === "PARAPHRASE") {
          spot(
            "정답 blankValues 전부 재진술(비축자)",
            verbatimFlags.length === def.blankCount && verbatimFlags.every((f) => !f),
            `축자 여부: [${verbatimFlags.join(", ")}]`,
          );
        } else {
          spot(
            "정답 blankValues 전부 원문 축자",
            verbatimFlags.length === def.blankCount && verbatimFlags.every((f) => f),
            `축자 여부: [${verbatimFlags.join(", ")}]`,
          );
        }
        spot(
          "선지 5·값 개수 일치",
          opts.length === 5 && opts.every((o) => o.blankValues.length === def.blankCount),
          `선지 ${opts.length}개, 값 [${opts.map((o) => o.blankValues.length).join(",")}]`,
        );
      } else {
        const ca = (d.correctAnswers ?? []) as string[];
        spot(`correctAnswers ${def.answerCount}개`, ca.length === def.answerCount, `실제 ${ca.length}개: ${ca.join(", ")}`);
        spot(
          "발문 '모두 고르시오'",
          d.direction === "다음 글의 밑줄 친 부분 중, 어법상 틀린 것을 모두 고르시오.",
          String(d.direction),
        );
        const woe = d.wrongOptionExplanations;
        const woeCount = Array.isArray(woe)
          ? woe.length
          : woe && typeof woe === "object"
            ? Object.keys(woe as Record<string, unknown>).length
            : 0;
        const expectedWrong = (def.markerCount ?? 0) - (def.answerCount ?? 0);
        spot(`오답해설 키 ${expectedWrong}개`, woeCount === expectedWrong, `실제 ${woeCount}개`);
        const mes = (d.markedExpressions ?? []) as Array<{ isError?: boolean }>;
        spot(
          `마커 ${def.markerCount}·isError ${def.answerCount}`,
          mes.length === def.markerCount && mes.filter((m) => m.isError === true).length === def.answerCount,
          `마커 ${mes.length}, isError ${mes.filter((m) => m.isError === true).length}`,
        );
      }
      return row;
    } catch (e) {
      row.error = e instanceof Error ? e.message : String(e);
      return row;
    }
  }

  console.log(`매트릭스 ${targets.length}콜 병렬 시작 (${MODEL}, reasoning high, max_tokens 14k)\n`);
  const rows = await Promise.all(targets.map((c) => runCase(c)));

  // ── 표 출력 ────────────────────────────────────────────────────────────────
  console.log("══ 실콜 매트릭스 결과 ══");
  console.log("케이스 | 시간 | 비용 | 게이트 | 어댑터 | 후처리 | 검증(error) | 스팟체크 | 종합");
  for (const r of rows) {
    const cost = r.costUsd != null ? `$${r.costUsd.toFixed(4)}(₩${(r.costUsd * 1470).toFixed(0)})` : "?";
    const spotOk = r.spotChecks.length > 0 && r.spotChecks.every((s) => s.ok);
    const overall =
      !r.error &&
      r.gate === "PASS" &&
      r.adapter === "PASS" &&
      r.postprocess === "PASS" &&
      r.validateErrors.length === 0 &&
      spotOk;
    const cells = [
      r.label,
      `${(r.durationMs / 1000).toFixed(0)}s`,
      cost,
      r.gate === "PASS" ? "PASS" : `REJECT`,
      r.adapter,
      r.postprocess,
      r.validateErrors.length === 0 ? "0건" : r.validateErrors.join(","),
      r.spotChecks.length === 0 ? "-" : spotOk ? `${r.spotChecks.length}/${r.spotChecks.length}` : `${r.spotChecks.filter((s) => s.ok).length}/${r.spotChecks.length}`,
      r.error ? `ERROR ${r.error.slice(0, 40)}` : overall ? "PASS" : "FAIL",
    ];
    console.log(cells.join(" | "));
  }

  console.log("\n══ 케이스 상세 ══");
  for (const r of rows) {
    console.log(`\n[${r.label}] (${r.key})`);
    if (r.error) console.log(`  콜 오류: ${r.error}`);
    if (r.gate !== "PASS" && r.gate !== "-") console.log(`  게이트 반려: ${r.gate}`);
    if (r.corrections.length > 0) console.log(`  자동 보정: ${r.corrections.join(" / ")}`);
    if (r.ppWarnings.length > 0) console.log(`  후처리 경고: ${r.ppWarnings.join(" / ")}`);
    if (r.validateWarnings.length > 0) console.log(`  검증 warning: ${r.validateWarnings.join(", ")}`);
    if (r.validateErrors.length > 0) console.log(`  검증 error: ${r.validateErrors.join(", ")}`);
    for (const s of r.spotChecks) {
      console.log(`  ${s.ok ? "OK " : "NG "} ${s.name} — ${s.detail.slice(0, 160)}`);
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = resolve(OUT_DIR, `live-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(
    outPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), model: MODEL, passageId: passage.id, passageTitle: passage.title, rows }, null, 2),
  );
  console.log(`\n원본 저장: ${outPath}`);

  await prisma.$disconnect();
  const allPass = rows.every(
    (r) =>
      !r.error &&
      r.gate === "PASS" &&
      r.adapter === "PASS" &&
      r.postprocess === "PASS" &&
      r.validateErrors.length === 0 &&
      r.spotChecks.length > 0 &&
      r.spotChecks.every((s) => s.ok),
  );
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
