/**
 * 다유형 프리미엄 E2E 하니스 (작성: Fable, 26-07-14) — harness.ts 패턴 재사용.
 *
 * corpus-30.json 앞 N개 지문에 대해 유형별로 prod 동일 경로
 * (runQuestionGenerationWithEmptyRetry)로 1문항씩 생성하고 전량 캡처한다:
 *   - 문항 전체 JSON + 원지문 (make-packets.mjs 호환 — question.passageWithMarkers
 *     또는 유형별 상당 필드(passageWithBlank/underline/numbers)는 question 안에 그대로 실림)
 *   - 텔레메트리(ok·ms·attempts·relaxedFallback·qualityMode·topReject)
 *   - 품질 이슈(validateQuestionQuality errors/warnings 코드)
 *
 * typeSettings 는 유형별 "최소 유효 형상" = src/lib/question-type-generation-settings
 * 배럴의 getDefaultQuestionTypeGenerationSettings() 리더 기본값을 그대로 사용
 * (예: BLANK_INFERENCE blankCount=1, VOCAB_CHOICE markerCount=5/answerCount=1,
 *  SUMMARY_COMPLETE_MC blankCount=2; TOPIC 등 generic 유형은 기본맵 미등재 → {}).
 * 여기에 유형별 difficulty 만 명시 주입해 diffLabel 과 정렬한다.
 *
 * ⚠️ 생성 모듈은 loadEnvConfig() '후' 동적 import (정적이면 API 키 빈 값 → 401).
 * 실행:
 *   NODE_OPTIONS="" npx tsx experiments/grammar-quality-20260714/e2e-premium-types.ts \
 *     --types BLANK_INFERENCE,VOCAB_CHOICE,TOPIC,SUMMARY_COMPLETE_MC --per 5 [--plan PREMIUM] [--difficulty INTERMEDIATE]
 * 결과: experiments/grammar-quality-20260714/e2e-types/<TYPE>/results.jsonl (+ summary.json)
 *   → 패킷: node experiments/grammar-quality-20260714/make-packets.mjs e2e-types/<TYPE>
 */
import { loadEnvConfig } from "@next/env";

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

// 다유형 "프리미엄" 하니스 — 기본 PREMIUM (--plan STANDARD 로 대조 가능).
const PLAN = (argValue("--plan") ?? "PREMIUM").toUpperCase();
// --plan PREMIUM 시: 프리미엄 잠정중단 클램프(SHOW_MODEL_SELECTOR) 우회 — 반드시 동적 import 전 프리셋.
if (PLAN === "PREMIUM") process.env.NEXT_PUBLIC_SHOW_MODEL_SELECTOR = "true";
loadEnvConfig(process.cwd());

import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "experiments", "grammar-quality-20260714");
const DEFAULT_TYPES = ["BLANK_INFERENCE", "VOCAB_CHOICE", "TOPIC", "SUMMARY_COMPLETE_MC"];
const TYPES = (argValue("--types") ?? DEFAULT_TYPES.join(","))
  .split(",")
  .map((t) => t.trim().toUpperCase())
  .filter(Boolean);
const PER = Math.max(1, Number(argValue("--per") ?? 5) || 5);
const DIFFICULTY = (argValue("--difficulty") ?? "INTERMEDIATE").toUpperCase();
const CONC = Math.max(1, Number(argValue("--conc") ?? 3) || 3);

type Corpus = { id: string; year: number; exam: string; type: string; words: number; text: string };

async function main() {
  const genMod = await import("../../src/app/api/ai/generate-questions-auto/_lib/run-question-generation");
  const qualMod = await import("../../src/lib/question-quality");
  const constMod = await import("../../src/app/api/ai/generate-questions-auto/_lib/constants");
  const settingsMod = await import("../../src/lib/question-type-generation-settings");
  const runGen = genMod.runQuestionGenerationWithEmptyRetry as unknown as (input: unknown, opts: unknown) => Promise<{
    questions: Record<string, unknown>[];
    attempts: number;
    relaxedFallback: boolean;
    rejectionSummary: Record<string, unknown>;
  }>;
  const validateQ = qualMod.validateQuestionQuality as (args: unknown) => { severity: string; code: string; message?: string }[];
  const DIFF_DESCRIPTION = constMod.DIFF_DESCRIPTION as Record<string, string>;
  // 유형별 최소 유효 형상 = 리더 기본값 (question-type-generation-settings 배럴).
  const defaultsByType = settingsMod.getDefaultQuestionTypeGenerationSettings() as Record<string, Record<string, unknown>>;

  if (!process.env.OPENROUTER_API_KEY && !process.env.ATLASCLOUD_API_KEY) throw new Error("OPENROUTER_API_KEY required");

  const corpus: Corpus[] = JSON.parse(fs.readFileSync(path.join(DIR, "corpus-30.json"), "utf8"));
  const items = corpus.slice(0, Math.min(PER, corpus.length));

  console.log(`[e2e-types] plan=${PLAN} difficulty=${DIFFICULTY} types=${TYPES.join(",")} per=${items.length} conc=${CONC}`);

  const overall: Record<string, unknown>[] = [];

  for (const TYPE of TYPES) {
    const outDir = path.join(DIR, "e2e-types", TYPE);
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, "results.jsonl");
    fs.writeFileSync(outFile, "");

    // 기본맵 미등재 유형(TOPIC 등 generic)은 {} — 리더가 전부 기본값으로 정규화한다.
    const typeSettings = { [TYPE]: { ...(defaultsByType[TYPE] ?? {}), difficulty: DIFFICULTY } };
    console.log(`[e2e-types] ${TYPE}: typeSettings=${JSON.stringify(typeSettings[TYPE])}`);

    let idx = 0;
    const results: Record<string, unknown>[] = [];
    await Promise.all(
      Array.from({ length: Math.min(CONC, items.length) }, async () => {
        while (idx < items.length) {
          const my = idx++;
          const p = items[my];
          const started = Date.now();
          let rec: Record<string, unknown>;
          try {
            const res = await runGen(
              {
                plan: [{ subType: TYPE, count: 1, reason: "e2e-premium-types", targetPoints: [] }],
                schoolType: "high school",
                gradeInfo: "grade 2",
                passageContent: p.text,
                teacherIntentBlock: "",
                analysisContext: "",
                diffLabel: DIFFICULTY,
                diffInstruction: DIFF_DESCRIPTION[DIFFICULTY] || "solid exam item",
                generationPlan: PLAN,
                typeSettings,
              },
              // harness.ts 와 동일: PREMIUM 은 270s deadline (Vercel 300s 벽 - 여유).
              { logPrefix: `E2E-${TYPE.slice(0, 10)}-${p.id.slice(0, 12)}`, deadlineAt: PLAN === "PREMIUM" ? Date.now() + 270_000 : undefined },
            );
            const q = res.questions[0] as Record<string, unknown> | undefined;
            const issues = q
              ? validateQ({ typeId: TYPE, question: q, passage: p.text, requestedDifficulty: DIFFICULTY })
              : [];
            rec = {
              passageId: p.id,
              type: TYPE,
              meta: { year: p.year, exam: p.exam, origType: p.type, words: p.words },
              difficulty: DIFFICULTY,
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
              // make-packets.mjs 블라인드 패킷용 — 마커형은 passageWithMarkers, 그 외 유형은
              // 상당 필드(passageWithBlank/underline/numbers) 우선. question 원본에도 그대로 실려 있다.
              displayPassage:
                (q?.passageWithMarkers as string | undefined) ??
                (q?.passageWithBlank as string | undefined) ??
                (q?.passageWithUnderline as string | undefined) ??
                (q?.passageWithNumbers as string | undefined) ??
                null,
              question: q ?? null,
              passageText: p.text,
            };
          } catch (e) {
            rec = {
              passageId: p.id, type: TYPE, difficulty: DIFFICULTY, ok: false, ms: Date.now() - started,
              error: e instanceof Error ? e.message : String(e), passageText: p.text,
            };
          }
          results[my] = rec;
          fs.appendFileSync(outFile, JSON.stringify(rec) + "\n");
          console.log(`[e2e-types] ${TYPE} ${my + 1}/${items.length} ${p.id.slice(0, 20)} ok=${rec.ok} att=${rec.attempts ?? "-"} relax=${rec.relaxedFallback ?? "-"} ms=${rec.ms} err=${Array.isArray(rec.errors) ? (rec.errors as string[]).join("|") || "-" : "-"}`);
        }
      }),
    );

    const oks = results.filter((r) => r.ok);
    const summary = {
      type: TYPE,
      plan: PLAN,
      difficulty: DIFFICULTY,
      total: results.length,
      ok: oks.length,
      failed: results.length - oks.length,
      relaxed: results.filter((r) => r.relaxedFallback === true).length,
      avgAttempts: oks.length ? Number((oks.reduce((s, r) => s + Number(r.attempts ?? 0), 0) / oks.length).toFixed(2)) : null,
      avgMs: oks.length ? Math.round(oks.reduce((s, r) => s + Number(r.ms), 0) / oks.length) : null,
      withErrors: results.filter((r) => Array.isArray(r.errors) && (r.errors as string[]).length > 0).length,
      withWarnings: results.filter((r) => Array.isArray(r.warnings) && (r.warnings as string[]).length > 0).length,
    };
    fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
    overall.push(summary);
    console.log(`[e2e-types] ${TYPE} summary: ${JSON.stringify(summary)}`);
  }

  console.log("\n[e2e-types] overall:", JSON.stringify(overall, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
