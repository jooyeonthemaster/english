/**
 * 어법 품질 대공사 라운드 하니스 (작성: Fable, 26-07-14)
 *
 * corpus-30.json 의 각 지문에 대해 prod 동일 경로(runQuestionGenerationWithEmptyRetry,
 * STANDARD/Gemini)로 어법 1문항을 생성하고, 품질 평가에 필요한 전부를 캡처한다:
 *   - 문항 전체 JSON(밑줄 표현·해설·keyPoints·정답)
 *   - 텔레메트리(시도수·완화·반려코드·소요ms)
 *   - 밑줄 위치 계량(문장 인덱스, 정규화 위치 0~1, 앞단 몰림 지표)
 *
 * 난이도는 인덱스 결정론 배정: i%3 → INTERMEDIATE / ADVANCED / KILLER (각 10개).
 * pointFocus=true (prod 기본값).
 *
 * ⚠️ 생성 모듈은 loadEnvConfig() '후' 동적 import (정적이면 API 키 빈 값 → 401).
 * 실행: NODE_OPTIONS="" npx tsx experiments/grammar-quality-20260714/harness.ts <roundName> [--limit N] [--focus id1,id2]
 */
import { loadEnvConfig } from "@next/env";
// --plan PREMIUM 지원: 프리미엄 잠정중단 클램프(SHOW_MODEL_SELECTOR) 우회 — 반드시 동적 import 전
const PLAN = process.argv.includes("--plan") ? String(process.argv[process.argv.indexOf("--plan")+1]||"STANDARD").toUpperCase() : "STANDARD";
if (PLAN === "PREMIUM") process.env.NEXT_PUBLIC_SHOW_MODEL_SELECTOR = "true";
loadEnvConfig(process.cwd());

import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "experiments", "grammar-quality-20260714");
const roundName = process.argv[2] || "round-0";
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;
const focusArg = process.argv.indexOf("--focus");
const FOCUS = focusArg > -1 ? new Set(process.argv[focusArg + 1].split(",")) : null;

const DIFFS = ["INTERMEDIATE", "ADVANCED", "KILLER"] as const;

type Corpus = { id: string; year: number; exam: string; type: string; words: number; text: string };

function splitSentences(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const re = /[^.!?]+[.!?]+(?:["')\]]+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ start: m.index, end: m.index + m[0].length });
  if (out.length === 0) out.push({ start: 0, end: text.length });
  return out;
}

function positionMetrics(passage: string, expressions: { label: string; expression: string; isError: boolean }[]) {
  const sentences = splitSentences(passage);
  const total = passage.length;
  let cursor = 0;
  const placed = expressions.map((e) => {
    // 순서 보존 탐색: 마커는 지문 순서대로 배치되므로 cursor 이후 첫 등장 위치를 쓴다.
    let idx = passage.indexOf(e.expression, cursor);
    if (idx === -1) idx = passage.indexOf(e.expression); // 폴백: 전체 탐색
    if (idx >= 0) cursor = idx + e.expression.length;
    const sentIdx = idx >= 0 ? sentences.findIndex((s) => idx >= s.start && idx < s.end) : -1;
    return {
      label: e.label,
      isError: e.isError,
      charPos: idx,
      relPos: idx >= 0 ? Number((idx / total).toFixed(3)) : null,
      sentenceIndex: sentIdx,
      found: idx >= 0,
    };
  });
  const rels = placed.filter((p) => p.relPos !== null).map((p) => p.relPos as number);
  const sentIdxs = [...new Set(placed.filter((p) => p.sentenceIndex >= 0).map((p) => p.sentenceIndex))];
  return {
    markers: placed,
    sentenceCount: sentences.length,
    distinctSentences: sentIdxs.length,
    lastMarkerRelPos: rels.length ? Math.max(...rels) : null, // 낮으면 뒷부분 미사용
    firstHalfShare: rels.length ? Number((rels.filter((r) => r < 0.5).length / rels.length).toFixed(2)) : null,
    notFoundCount: placed.filter((p) => !p.found).length,
  };
}

async function main() {
  const genMod = await import("../../src/app/api/ai/generate-questions-auto/_lib/run-question-generation");
  const qualMod = await import("../../src/lib/question-quality");
  const constMod = await import("../../src/app/api/ai/generate-questions-auto/_lib/constants");
  const runGen = genMod.runQuestionGenerationWithEmptyRetry as unknown as (input: unknown, opts: unknown) => Promise<{
    questions: Record<string, unknown>[];
    attempts: number;
    relaxedFallback: boolean;
    rejectionSummary: Record<string, unknown>;
  }>;
  const validateQ = qualMod.validateQuestionQuality as (args: unknown) => { severity: string; code: string; message?: string }[];
  const DIFF_DESCRIPTION = constMod.DIFF_DESCRIPTION as Record<string, string>;

  if (!process.env.OPENROUTER_API_KEY && !process.env.ATLASCLOUD_API_KEY) throw new Error("OPENROUTER_API_KEY required");

  const corpus: Corpus[] = JSON.parse(fs.readFileSync(path.join(DIR, "corpus-30.json"), "utf8"));
  let items = corpus.map((p, i) => ({ ...p, difficulty: DIFFS[i % 3] as string }));
  if (FOCUS) items = items.filter((p) => FOCUS.has(p.id));
  items = items.slice(0, LIMIT);

  const outDir = path.join(DIR, roundName);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "results.jsonl");
  fs.writeFileSync(outFile, "");

  console.log(`[harness] ${roundName}: ${items.length} passages, STANDARD, pointFocus=true`);

  let idx = 0;
  const CONC = 3;
  const results: Record<string, unknown>[] = [];
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (idx < items.length) {
        const my = idx++;
        const p = items[my];
        const started = Date.now();
        let rec: Record<string, unknown>;
        try {
          const res = await runGen(
            {
              plan: [{ subType: "GRAMMAR_ERROR", count: 1, reason: "quality-harness", targetPoints: [] }],
              schoolType: "high school",
              gradeInfo: "grade 2",
              passageContent: p.text,
              teacherIntentBlock: "",
              analysisContext: "",
              diffLabel: p.difficulty,
              diffInstruction: DIFF_DESCRIPTION[p.difficulty] || "solid exam item",
              generationPlan: PLAN,
              typeSettings: { GRAMMAR_ERROR: { difficulty: p.difficulty, pointFocus: true, answerCount: 1, markerCount: 5 } },
            },
            { logPrefix: `HQ-${roundName}-${p.id.slice(0, 12)}`, deadlineAt: PLAN === "PREMIUM" ? Date.now() + 270_000 : undefined },
          );
          const q = res.questions[0] as Record<string, unknown> | undefined;
          const me = q && Array.isArray(q.markedExpressions)
            ? (q.markedExpressions as { label: string; expression: string; isError: boolean; pointCode?: string }[])
            : [];
          const issues = q
            ? validateQ({ typeId: "GRAMMAR_ERROR", question: q, passage: p.text, requestedDifficulty: p.difficulty })
            : [];
          rec = {
            passageId: p.id,
            meta: { year: p.year, exam: p.exam, origType: p.type, words: p.words },
            difficulty: p.difficulty,
            ok: res.questions.length === 1,
            ms: Date.now() - started,
            attempts: res.attempts,
            relaxedFallback: res.relaxedFallback,
            qualityMode: (q?._qualityMode as string) ?? null,
            errors: issues.filter((i) => i.severity === "error").map((i) => i.code),
            warnings: issues.filter((i) => i.severity === "warning").map((i) => i.code),
            topReject: Array.isArray(res.rejectionSummary?.topCodes)
              ? (res.rejectionSummary.topCodes as Record<string, unknown>[]).slice(0, 6).map((c) => `${c.code}x${c.count}`)
              : [],
            layout: me.map((m) => `${m.label}:${m.isError ? "ANS" : "dec"}=${m.pointCode ?? "?"}`).join("  "),
            positions: me.length ? positionMetrics(p.text, me) : null,
            question: q ?? null,
            passageText: p.text,
          };
        } catch (e) {
          rec = {
            passageId: p.id, difficulty: p.difficulty, ok: false, ms: Date.now() - started,
            error: e instanceof Error ? e.message : String(e), passageText: p.text,
          };
        }
        results[my] = rec;
        fs.appendFileSync(outFile, JSON.stringify(rec) + "\n");
        console.log(`[harness] done ${my + 1}/${items.length} ${p.id.slice(0, 20)} ${p.difficulty} ok=${rec.ok} att=${rec.attempts ?? "-"} relax=${rec.relaxedFallback ?? "-"} lastPos=${(rec.positions as Record<string, unknown> | null)?.lastMarkerRelPos ?? "-"}`);
      }
    }),
  );

  // 요약
  const oks = results.filter((r) => r.ok);
  const summary = {
    round: roundName,
    total: results.length,
    ok: oks.length,
    failed: results.length - oks.length,
    relaxed: results.filter((r) => r.relaxedFallback === true).length,
    avgAttempts: oks.length ? Number((oks.reduce((s, r) => s + Number(r.attempts ?? 0), 0) / oks.length).toFixed(2)) : null,
    avgMs: oks.length ? Math.round(oks.reduce((s, r) => s + Number(r.ms), 0) / oks.length) : null,
    avgLastMarkerRelPos: (() => {
      const v = oks.map((r) => (r.positions as { lastMarkerRelPos: number | null } | null)?.lastMarkerRelPos).filter((x): x is number => typeof x === "number");
      return v.length ? Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(3)) : null;
    })(),
    byDifficulty: DIFFS.map((d) => {
      const g = results.filter((r) => r.difficulty === d);
      return { difficulty: d, n: g.length, ok: g.filter((r) => r.ok).length, relaxed: g.filter((r) => r.relaxedFallback === true).length };
    }),
  };
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log("\n[summary]", JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
