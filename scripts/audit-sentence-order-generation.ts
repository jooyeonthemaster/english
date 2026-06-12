/**
 * Sentence-order generation audit.
 *
 * Calls the real STANDARD/Gemini workbench generation path and checks the
 * CSAT-style split contract: given 1-2 sentences, balanced (A)/(B)/(C), valid
 * permutations, and no visible-order answer.
 */
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false });

import { runQuestionGenerationWithEmptyRetry } from "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation";
import {
  type QuestionQualityIssue,
  validateQuestionQuality,
} from "../src/lib/question-quality";
import { HS_PASSAGE_DATA } from "./data/hs-passages";

type Difficulty = "BASIC" | "INTERMEDIATE" | "KILLER";

type PassageFixture = {
  title: string;
  content: string;
  grade: number;
  source: string;
};

type RunCase = {
  index: number;
  difficulty: Difficulty;
  passage: PassageFixture;
};

type SplitStats = {
  givenSentences: number;
  givenWords: number;
  paragraphSentences: number[];
  paragraphWords: number[];
  correctOrder?: string;
};

type SampleResult = {
  index: number;
  difficulty: Difficulty;
  passageTitle: string;
  ok: boolean;
  attempts: number;
  relaxedFallback: boolean;
  ms: number;
  qualityErrors: QuestionQualityIssue[];
  qualityWarnings: QuestionQualityIssue[];
  rejectionSummary: unknown;
  stats?: SplitStats;
  question?: Record<string, unknown>;
};

const OUTDIR = path.join(process.cwd(), "scripts", "_gen_audit_out");
const TOTAL = Math.max(1, Number(process.env.SENTENCE_ORDER_AUDIT_TOTAL || 12));
const MAX_ATTEMPTS = Math.max(1, Number(process.env.SENTENCE_ORDER_AUDIT_MAX_ATTEMPTS || 6));
const RUN_ID = process.env.SENTENCE_ORDER_AUDIT_RUN_ID || new Date().toISOString().replace(/[:.]/g, "-");
const DIFFICULTIES: Difficulty[] = ["BASIC", "INTERMEDIATE", "KILLER"];

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function countSentences(value: unknown): number {
  const text = normalizeText(value);
  if (!text) return 0;
  return Math.max(
    1,
    text
      .split(/(?<=[.!?])\s+(?=[A-Z"'([])/)
      .map((part) => part.trim())
      .filter(Boolean).length,
  );
}

function countWords(value: unknown): number {
  const text = normalizeText(value);
  return text.match(/[A-Za-z]+(?:['-][A-Za-z]+)?|\d+(?:[.,]\d+)*/g)?.length ?? 0;
}

function selectedPassages(): PassageFixture[] {
  return HS_PASSAGE_DATA
    .flatMap((group) =>
      group.passages.map((passage) => ({
        title: passage.title,
        content: passage.content.replace(/\s+/g, " ").trim(),
        grade: group.grade,
        source: passage.source,
      })),
    )
    .filter((passage) => passage.content.length >= 900)
    .filter((passage) => countSentences(passage.content) >= 9);
}

function buildCases(total: number): RunCase[] {
  const passages = selectedPassages();
  if (passages.length === 0) throw new Error("No passage fixtures available.");
  return Array.from({ length: total }, (_, index) => ({
    index: index + 1,
    difficulty: DIFFICULTIES[index % DIFFICULTIES.length],
    passage: passages[(index * 5) % passages.length],
  }));
}

function difficultyInstruction(difficulty: Difficulty) {
  if (difficulty === "BASIC") return "fair sentence-order item with clear discourse clues";
  if (difficulty === "INTERMEDIATE") return "sentence-order item requiring two or more cohesion clues";
  return "top-tier sentence-order item requiring global flow and local cohesion checks";
}

function sentenceOrderStats(question: Record<string, unknown> | undefined): SplitStats | undefined {
  if (!question) return undefined;
  const paragraphs = Array.isArray(question.paragraphs)
    ? question.paragraphs.filter((item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
      )
    : [];
  const options = Array.isArray(question.options)
    ? question.options.filter((item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
      )
    : [];
  const correctAnswer = normalizeText(question.correctAnswer);
  const correctOption = options.find((option) => normalizeText(option.label) === correctAnswer);
  return {
    givenSentences: countSentences(question.givenSentence),
    givenWords: countWords(question.givenSentence),
    paragraphSentences: paragraphs.map((paragraph) => countSentences(paragraph.text)),
    paragraphWords: paragraphs.map((paragraph) => countWords(paragraph.text)),
    correctOrder: normalizeText(correctOption?.text) || undefined,
  };
}

async function runOne(testCase: RunCase): Promise<SampleResult> {
  const startedAt = Date.now();
  console.log(
    `[sentence-order-audit] #${testCase.index}/${TOTAL} ${testCase.difficulty} :: ${testCase.passage.title}`,
  );

  try {
    const generationResult = await runQuestionGenerationWithEmptyRetry({
      plan: [
        {
          subType: "SENTENCE_ORDER",
          count: 1,
          reason: "sentence-order generation split-contract audit",
          targetPoints: [
            "split the passage into a short given part and balanced (A)/(B)/(C) chunks using discourse clues",
          ],
        },
      ],
      schoolType: "고등학교",
      gradeInfo: `${testCase.passage.grade}학년`,
      passageContent: testCase.passage.content,
      teacherIntentBlock: "",
      analysisContext: "",
      diffLabel: testCase.difficulty,
      diffInstruction: difficultyInstruction(testCase.difficulty),
      generationPlan: "STANDARD",
    }, {
      logPrefix: "SENTENCE-ORDER-AUDIT",
      maxAttempts: MAX_ATTEMPTS,
    });

    const question = generationResult.questions[0];
    const qualityIssues = question
      ? validateQuestionQuality({
          typeId: "SENTENCE_ORDER",
          question,
          passage: testCase.passage.content,
          requestedDifficulty: testCase.difficulty,
        })
      : [{ severity: "error" as const, code: "missing-question", message: "No question generated." }];
    const qualityErrors = qualityIssues.filter((issue) => issue.severity === "error");
    const qualityWarnings = qualityIssues.filter((issue) => issue.severity === "warning");

    return {
      index: testCase.index,
      difficulty: testCase.difficulty,
      passageTitle: testCase.passage.title,
      ok: !!question && qualityErrors.length === 0,
      attempts: generationResult.attempts,
      relaxedFallback: generationResult.relaxedFallback,
      ms: Date.now() - startedAt,
      qualityErrors,
      qualityWarnings,
      rejectionSummary: generationResult.rejectionSummary,
      stats: sentenceOrderStats(question),
      question,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      index: testCase.index,
      difficulty: testCase.difficulty,
      passageTitle: testCase.passage.title,
      ok: false,
      attempts: 0,
      relaxedFallback: false,
      ms: Date.now() - startedAt,
      qualityErrors: [{ severity: "error", code: "generation-exception", message }],
      qualityWarnings: [],
      rejectionSummary: null,
    };
  }
}

function writeReports(results: SampleResult[]) {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const okCount = results.filter((result) => result.ok).length;
  const failCount = results.length - okCount;
  const avgAttempts =
    results.reduce((sum, result) => sum + result.attempts, 0) / Math.max(1, results.length);
  const allErrorCodes = results.flatMap((result) => result.qualityErrors.map((issue) => issue.code));
  const codeCounts = [...new Set(allErrorCodes)].map((code) => ({
    code,
    count: allErrorCodes.filter((item) => item === code).length,
  })).sort((a, b) => b.count - a.count);

  const jsonPath = path.join(OUTDIR, `sentence-order-audit-${RUN_ID}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ runId: RUN_ID, total: results.length, okCount, failCount, avgAttempts, codeCounts, results }, null, 2), "utf8");

  const mdPath = path.join(OUTDIR, `sentence-order-audit-${RUN_ID}.md`);
  const lines = [
    `# Sentence Order Generation Audit (${RUN_ID})`,
    "",
    `- Total: ${results.length}`,
    `- Passed: ${okCount}`,
    `- Failed: ${failCount}`,
    `- Avg attempts: ${avgAttempts.toFixed(2)}`,
    `- Top error codes: ${codeCounts.map((item) => `${item.code} x${item.count}`).join(", ") || "none"}`,
    "",
    "| # | Difficulty | Passage | OK | Attempts | Given s/w | A/B/C s | A/B/C w | Correct | Errors |",
    "|---:|---|---|---:|---:|---|---|---|---|---|",
    ...results.map((result) => {
      const stats = result.stats;
      return [
        result.index,
        result.difficulty,
        result.passageTitle.replace(/\|/g, "/"),
        result.ok ? "yes" : "no",
        result.attempts,
        stats ? `${stats.givenSentences}/${stats.givenWords}` : "-",
        stats ? stats.paragraphSentences.join("/") : "-",
        stats ? stats.paragraphWords.join("/") : "-",
        stats?.correctOrder ?? "-",
        result.qualityErrors.map((issue) => issue.code).join(", ") || "-",
      ].join(" | ");
    }),
  ];
  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");
  return { jsonPath, mdPath, okCount, failCount, avgAttempts, codeCounts };
}

async function main() {
  const cases = buildCases(TOTAL);
  const results: SampleResult[] = [];
  for (const testCase of cases) {
    const result = await runOne(testCase);
    results.push(result);
    const stats = result.stats;
    console.log(
      `[sentence-order-audit] #${result.index} ${result.ok ? "OK" : "FAIL"} attempts=${result.attempts} given=${stats ? `${stats.givenSentences}/${stats.givenWords}` : "-"} chunks=${stats ? `${stats.paragraphSentences.join("/")};${stats.paragraphWords.join("/")}` : "-"} errors=${result.qualityErrors.map((issue) => issue.code).join(",") || "-"}`,
    );
  }

  const report = writeReports(results);
  console.log(
    `[sentence-order-audit] done ok=${report.okCount}/${TOTAL} failed=${report.failCount} avgAttempts=${report.avgAttempts.toFixed(2)}`,
  );
  console.log(`[sentence-order-audit] md=${report.mdPath}`);
  console.log(`[sentence-order-audit] json=${report.jsonPath}`);

  if (process.env.SENTENCE_ORDER_AUDIT_FAIL_ON_ERROR === "true" && report.failCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
