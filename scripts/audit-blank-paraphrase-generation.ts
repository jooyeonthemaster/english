/**
 * BLANK_INFERENCE paraphrase-answer generation audit.
 *
 * Calls the real STANDARD/Gemini workbench generation path with the
 * "paraphraseAnswer" setting enabled and checks that correct options are
 * non-verbatim, difficulty-calibrated paraphrases rather than copied source
 * expressions.
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

type BlankParaphraseStats = {
  originalExpression: string;
  correctText: string;
  blankAnswerMode: string;
  exactCopy: boolean;
  nearVerbatim: boolean;
  originalWords: number;
  correctWords: number;
  correctContentTokens: number;
  optionWordCounts: number[];
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
  stats?: BlankParaphraseStats;
  question?: Record<string, unknown>;
};

const OUTDIR = path.join(process.cwd(), "scripts", "_gen_audit_out");
const TOTAL = Math.max(1, Number(process.env.BLANK_PARAPHRASE_AUDIT_TOTAL || 12));
const MAX_ATTEMPTS = Math.max(1, Number(process.env.BLANK_PARAPHRASE_AUDIT_MAX_ATTEMPTS || 6));
const RUN_ID = process.env.BLANK_PARAPHRASE_AUDIT_RUN_ID || new Date().toISOString().replace(/[:.]/g, "-");
const DIFFICULTIES: Difficulty[] = ["BASIC", "INTERMEDIATE", "KILLER"];

const STOPWORDS = new Set([
  "about",
  "after",
  "also",
  "because",
  "been",
  "being",
  "between",
  "could",
  "from",
  "have",
  "into",
  "more",
  "most",
  "only",
  "other",
  "over",
  "should",
  "some",
  "such",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "this",
  "through",
  "under",
  "when",
  "where",
  "which",
  "while",
  "with",
  "without",
  "would",
]);

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeComparableText(value: unknown): string {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function countWords(value: unknown): number {
  return normalizeText(value).match(/[A-Za-z]+(?:['-][A-Za-z]+)?|\d+(?:[.,]\d+)*/g)?.length ?? 0;
}

function contentTokens(value: unknown): Set<string> {
  const tokens = normalizeText(value).toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? [];
  return new Set(tokens.filter((token) => !STOPWORDS.has(token)));
}

function countOverlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) if (b.has(token)) count += 1;
  return count;
}

function nearVerbatim(candidate: string, source: string): boolean {
  const candidateComparable = normalizeComparableText(candidate);
  const sourceComparable = normalizeComparableText(source);
  if (!candidateComparable || !sourceComparable) return false;
  if (candidateComparable === sourceComparable) return true;
  if (
    sourceComparable.length >= 16 &&
    (candidateComparable.includes(sourceComparable) ||
      sourceComparable.includes(candidateComparable))
  ) {
    return true;
  }
  const sourceTokens = contentTokens(source);
  const candidateTokens = contentTokens(candidate);
  const smaller = Math.min(sourceTokens.size, candidateTokens.size);
  if (smaller < 3) return false;
  const overlapRatio = countOverlap(sourceTokens, candidateTokens) / smaller;
  return overlapRatio >= 0.8 && Math.abs(countWords(source) - countWords(candidate)) <= 2;
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
    .filter((passage) => passage.content.length >= 650);
}

function buildCases(total: number): RunCase[] {
  const passages = selectedPassages();
  if (passages.length === 0) throw new Error("No passage fixtures available.");
  return Array.from({ length: total }, (_, index) => ({
    index: index + 1,
    difficulty: DIFFICULTIES[index % DIFFICULTIES.length],
    passage: passages[(index * 7) % passages.length],
  }));
}

function difficultyInstruction(difficulty: Difficulty) {
  if (difficulty === "BASIC") return "fair blank inference item with a short high-frequency paraphrased answer";
  if (difficulty === "INTERMEDIATE") return "blank inference item with a natural academic paraphrased answer and close distractors";
  return "top-tier blank inference item with an abstract but precise paraphrased answer and subtle passage-grounded traps";
}

function getCorrectOption(question: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!question) return undefined;
  const options = Array.isArray(question.options)
    ? question.options.filter((item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
      )
    : [];
  const correctAnswer = normalizeText(question.correctAnswer);
  return options.find((option) => normalizeText(option.label) === correctAnswer);
}

function blankStats(question: Record<string, unknown> | undefined): BlankParaphraseStats | undefined {
  if (!question) return undefined;
  const correctOption = getCorrectOption(question);
  const options = Array.isArray(question.options)
    ? question.options.filter((item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
      )
    : [];
  const originalExpression = normalizeText(question.originalExpression);
  const correctText = normalizeText(correctOption?.text);
  return {
    originalExpression,
    correctText,
    blankAnswerMode: normalizeText(question.blankAnswerMode),
    exactCopy: normalizeComparableText(originalExpression) === normalizeComparableText(correctText),
    nearVerbatim: nearVerbatim(correctText, originalExpression),
    originalWords: countWords(originalExpression),
    correctWords: countWords(correctText),
    correctContentTokens: contentTokens(correctText).size,
    optionWordCounts: options.map((option) => countWords(option.text)),
  };
}

async function runOne(testCase: RunCase): Promise<SampleResult> {
  const startedAt = Date.now();
  console.log(
    `[blank-paraphrase-audit] #${testCase.index}/${TOTAL} ${testCase.difficulty} :: ${testCase.passage.title}`,
  );

  try {
    const generationResult = await runQuestionGenerationWithEmptyRetry({
      plan: [
        {
          subType: "BLANK_INFERENCE",
          count: 1,
          reason: "blank paraphrase generation audit",
          targetPoints: [
            "blank a central passage expression, but make the correct option a difficulty-calibrated non-verbatim paraphrase",
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
      typeSettings: {
        BLANK_INFERENCE: {
          blankCount: 1,
          paraphraseAnswer: true,
          doubleNegative: false,
        },
      },
    }, {
      logPrefix: "BLANK-PARAPHRASE-AUDIT",
      maxAttempts: MAX_ATTEMPTS,
    });

    const question = generationResult.questions[0];
    const qualityIssues = question
      ? validateQuestionQuality({
          typeId: "BLANK_INFERENCE",
          question,
          passage: testCase.passage.content,
          requestedDifficulty: testCase.difficulty,
          blankInferenceBlankCount: 1,
          blankInferenceParaphraseAnswer: true,
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
      stats: blankStats(question),
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

  const jsonPath = path.join(OUTDIR, `blank-paraphrase-audit-${RUN_ID}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ runId: RUN_ID, total: results.length, okCount, failCount, avgAttempts, codeCounts, results }, null, 2), "utf8");

  const mdPath = path.join(OUTDIR, `blank-paraphrase-audit-${RUN_ID}.md`);
  const lines = [
    `# Blank Paraphrase Generation Audit (${RUN_ID})`,
    "",
    `- Total: ${results.length}`,
    `- Passed: ${okCount}`,
    `- Failed: ${failCount}`,
    `- Avg attempts: ${avgAttempts.toFixed(2)}`,
    `- Top error codes: ${codeCounts.map((item) => `${item.code} x${item.count}`).join(", ") || "none"}`,
    "",
    "| # | Difficulty | Passage | OK | Attempts | Mode | Original w | Correct w | Exact | Near | Errors |",
    "|---:|---|---|---:|---:|---|---:|---:|---:|---:|---|",
    ...results.map((result) => {
      const stats = result.stats;
      return [
        result.index,
        result.difficulty,
        result.passageTitle.replace(/\|/g, "/"),
        result.ok ? "yes" : "no",
        result.attempts,
        stats?.blankAnswerMode || "-",
        stats?.originalWords ?? "-",
        stats?.correctWords ?? "-",
        stats?.exactCopy ? "yes" : "no",
        stats?.nearVerbatim ? "yes" : "no",
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
      `[blank-paraphrase-audit] #${result.index} ${result.ok ? "OK" : "FAIL"} attempts=${result.attempts} mode=${stats?.blankAnswerMode || "-"} sourceW=${stats?.originalWords ?? "-"} correctW=${stats?.correctWords ?? "-"} exact=${stats?.exactCopy ? "Y" : "N"} near=${stats?.nearVerbatim ? "Y" : "N"} errors=${result.qualityErrors.map((issue) => issue.code).join(",") || "-"}`,
    );
  }

  const report = writeReports(results);
  console.log(
    `[blank-paraphrase-audit] done ok=${report.okCount}/${TOTAL} failed=${report.failCount} avgAttempts=${report.avgAttempts.toFixed(2)}`,
  );
  console.log(`[blank-paraphrase-audit] md=${report.mdPath}`);
  console.log(`[blank-paraphrase-audit] json=${report.jsonPath}`);

  if (process.env.BLANK_PARAPHRASE_AUDIT_FAIL_ON_ERROR === "true" && report.failCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
