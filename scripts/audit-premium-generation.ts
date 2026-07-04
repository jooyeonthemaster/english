import fs from "node:fs";
import path from "node:path";

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type AuditCase = {
  type: string;
  difficulty: "BASIC" | "INTERMEDIATE" | "KILLER";
  settings?: Record<string, unknown>;
};

const DEFAULT_ACADEMY_ID = "cmommhl7a0000mmekxmbqfefe";
let disconnectPrisma: (() => Promise<void>) | undefined;

const CASES: AuditCase[] = [
  { type: "GRAMMAR_ERROR", difficulty: "INTERMEDIATE", settings: { markerCount: 5, answerCount: 1, pointFocus: true } },
  { type: "GRAMMAR_ERROR", difficulty: "KILLER", settings: { markerCount: 5, answerCount: 1, pointFocus: true } },
  { type: "GRAMMAR_CHOICE_COMBO", difficulty: "INTERMEDIATE", settings: { pointFocus: true } },
  { type: "BLANK_INFERENCE", difficulty: "INTERMEDIATE", settings: { paraphraseAnswer: true } },
  { type: "BLANK_INFERENCE", difficulty: "KILLER", settings: { blankCount: 2, paraphraseAnswer: true } },
  { type: "IRRELEVANT", difficulty: "INTERMEDIATE", settings: { slotCount: 5 } },
  { type: "SENTENCE_INSERT", difficulty: "INTERMEDIATE", settings: { slotCount: 5, paraphrasePrefix: true } },
  { type: "VOCAB_CHOICE", difficulty: "INTERMEDIATE", settings: { markerCount: 5, answerCount: 1 } },
  { type: "CONTENT_MATCH", difficulty: "INTERMEDIATE", settings: { optionCount: 6, answerCount: 1 } },
  { type: "SUMMARY_COMPLETE_MC", difficulty: "INTERMEDIATE", settings: { blankCount: 2 } },
  { type: "SENTENCE_ORDER", difficulty: "INTERMEDIATE", settings: { prefixVariationCount: 1 } },
  { type: "TITLE", difficulty: "INTERMEDIATE", settings: { optionCount: 5, answerCount: 1 } },
];

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function selectedCases(): AuditCase[] {
  const raw = process.env.PREMIUM_AUDIT_TYPES;
  if (!raw) return CASES;
  const wanted = new Set(raw.split(",").map((item) => item.trim()).filter(Boolean));
  return CASES.filter((item) => wanted.has(item.type));
}

function readBoolEnv(name: string): boolean {
  const raw = process.env[name];
  if (!raw) return false;
  return /^(1|true|yes|y)$/i.test(raw.trim());
}

async function main() {
  const [
    { prisma },
    { buildQuestionAnnotationBlock },
    { DIFF_DESCRIPTION },
    { buildAnalysisContext, extractTeacherAnnotations },
    { runQuestionGenerationWithEmptyRetry },
  ] = await Promise.all([
    import("../src/lib/prisma"),
    import("../src/lib/annotation-prompt"),
    import("../src/app/api/ai/generate-questions-auto/_lib/constants"),
    import("../src/app/api/ai/generate-questions-auto/_lib/build-analysis-context"),
    import("../src/app/api/ai/generate-questions-auto/_lib/run-question-generation"),
  ]);
  disconnectPrisma = () => prisma.$disconnect();

  const academyId = process.env.PREMIUM_AUDIT_ACADEMY_ID ?? DEFAULT_ACADEMY_ID;
  const passageLimit = readIntEnv("PREMIUM_AUDIT_PASSAGES", 4);
  const maxRuns = readIntEnv("PREMIUM_AUDIT_RUNS", 8);
  const maxAttempts = readIntEnv("PREMIUM_AUDIT_ATTEMPTS", 2);
  const cases = selectedCases();
  const includeFullQuestion = readBoolEnv("PREMIUM_AUDIT_INCLUDE_FULL");

  const passages = await prisma.passage.findMany({
    where: {
      academyId,
      OR: [{ subject: null }, { subject: { not: "KOREAN" } }],
    },
    orderBy: { updatedAt: "desc" },
    take: passageLimit,
    include: {
      school: { select: { type: true } },
      notes: { orderBy: { order: "asc" } },
      analysis: { select: { analysisData: true } },
    },
  });

  const results: Array<Record<string, unknown>> = [];
  let runIndex = 0;

  for (const passage of passages) {
    for (const testCase of cases) {
      if (runIndex >= maxRuns) break;
      runIndex += 1;
      const startedAt = Date.now();
      const diffInstruction =
        DIFF_DESCRIPTION[testCase.difficulty] ?? DIFF_DESCRIPTION.INTERMEDIATE;
      const teacherIntentBlock = buildQuestionAnnotationBlock(
        extractTeacherAnnotations(passage),
      );
      const analysisContext = buildAnalysisContext(passage);
      const usageEvents: unknown[] = [];

      try {
        const result = await runQuestionGenerationWithEmptyRetry(
          {
            plan: [
              {
                subType: testCase.type,
                count: 1,
                reason: "Premium audit case",
                targetPoints: [],
              },
            ],
            schoolType: passage.school?.type === "MIDDLE" ? "중학교" : "고등학교",
            gradeInfo: passage.grade ? `${passage.grade}학년` : "",
            passageContent: passage.content,
            teacherIntentBlock,
            analysisContext,
            diffLabel: testCase.difficulty,
            diffInstruction,
            generationPlan: "PREMIUM",
            typeSettings: {
              [testCase.type]: {
                ...testCase.settings,
                difficulty: testCase.difficulty,
                generationPlan: "PREMIUM",
              },
            },
            onModelUsage: (event) => usageEvents.push(event),
          },
          {
            maxAttempts,
            logPrefix: `PREMIUM-AUDIT:${runIndex}:${testCase.type}`,
            deadlineAt: Date.now() + 300_000,
          },
        );

        const first = result.questions[0];
        const row = {
          ok: result.questions.length > 0,
          passageId: passage.id,
          title: passage.title,
          type: testCase.type,
          difficulty: testCase.difficulty,
          attempts: result.attempts,
          relaxedFallback: result.relaxedFallback,
          durationMs: Date.now() - startedAt,
          rejectionSummary: result.rejectionSummary,
          usageEvents,
          firstQuestion: first
            ? {
                correctAnswer: first.correctAnswer,
                difficulty: first.difficulty,
                optionCount: Array.isArray(first.options) ? first.options.length : undefined,
                markerCount: Array.isArray(first.markedExpressions)
                  ? first.markedExpressions.length
                  : undefined,
              }
            : null,
          ...(includeFullQuestion ? { questions: result.questions } : {}),
        };
        results.push(row);
        console.log(JSON.stringify(row));
      } catch (error) {
        const row = {
          ok: false,
          passageId: passage.id,
          title: passage.title,
          type: testCase.type,
          difficulty: testCase.difficulty,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
          usageEvents,
        };
        results.push(row);
        console.log(JSON.stringify(row));
      }
    }
    if (runIndex >= maxRuns) break;
  }

  const outDir = path.join(process.cwd(), "artifacts", "ai-audits");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `premium-generation-audit-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ createdAt: new Date().toISOString(), results }, null, 2));
  console.log(`Wrote ${outPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma?.();
  });
