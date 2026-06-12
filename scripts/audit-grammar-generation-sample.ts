/**
 * 100-sample audit for grammar generation quality.
 *
 * Exercises the real Gemini/STANDARD workbench generation path across
 * multiple passages, difficulties, and both grammar subtypes, then performs
 * an additional per-option / per-underlined-segment audit on top of the
 * normal quality gate.
 */
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false });

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { runQuestionGenerationWithEmptyRetry } from "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation";
import { StructuredQuestionRenderer } from "../src/components/workbench/question-renderers";
import {
  type QuestionQualityIssue,
  validateQuestionQuality,
} from "../src/lib/question-quality";
import { HS_PASSAGE_DATA } from "./data/hs-passages";

type GrammarTypeId = "GRAMMAR_ERROR" | "GRAMMAR_CORRECTION";
type Difficulty = "BASIC" | "INTERMEDIATE" | "KILLER";
type AuditSeverity = "error" | "warning";

type AuditIssue = {
  severity: AuditSeverity;
  code: string;
  message: string;
  label?: string;
};

type PassageFixture = {
  title: string;
  content: string;
  grade: number;
  semester: string;
  source: string;
};

type RunCase = {
  index: number;
  typeId: GrammarTypeId;
  difficulty: Difficulty;
  passage: PassageFixture;
  grammarMarkerCount?: number;
  grammarAnswerCount?: number;
  grammarCorrectionErrorCount?: number;
};

type LabelAudit = {
  label: string;
  optionText?: string;
  expression?: string;
  errorExpression?: string;
  correction?: string;
  pointCode?: string;
  isError?: boolean;
  sourceBacked: boolean;
  rendered: boolean;
  explanationPresent: boolean;
  issues: AuditIssue[];
};

type SegmentAudit = {
  label: string;
  sourceText?: string;
  displayedText?: string;
  errorPart?: string;
  correctedPart?: string;
  sourceBacked: boolean;
  rendered: boolean;
  wideEnough: boolean;
  explanationPresent: boolean;
  issues: AuditIssue[];
};

type SampleResult = {
  index: number;
  typeId: GrammarTypeId;
  difficulty: Difficulty;
  passageTitle: string;
  settings: Record<string, number | undefined>;
  ok: boolean;
  attempts: number;
  relaxedFallback: boolean;
  ms: number;
  qualityErrors: QuestionQualityIssue[];
  qualityWarnings: QuestionQualityIssue[];
  auditErrors: AuditIssue[];
  auditWarnings: AuditIssue[];
  renderOk: boolean;
  renderError?: string;
  jsonOk: boolean;
  jsonError?: string;
  rejectionSummary: unknown;
  answerPointCodes: string[];
  markedPointCodes: string[];
  labelAudits?: LabelAudit[];
  segmentAudits?: SegmentAudit[];
  question?: Record<string, unknown>;
};

const OUTDIR = path.join(process.cwd(), "scripts", "_gen_audit_out");
const TOTAL = Math.max(1, Number(process.env.GRAMMAR_AUDIT_TOTAL || 100));
const CONCURRENCY = Math.max(1, Number(process.env.GRAMMAR_AUDIT_CONCURRENCY || 1));
const MAX_ATTEMPTS = Math.max(1, Number(process.env.GRAMMAR_AUDIT_MAX_ATTEMPTS || 6));
const RUN_ID = process.env.GRAMMAR_AUDIT_RUN_ID || new Date().toISOString().replace(/[:.]/g, "-");
const DIFFICULTIES: Difficulty[] = ["BASIC", "INTERMEDIATE", "KILLER"];
const TYPES: GrammarTypeId[] = ["GRAMMAR_ERROR", "GRAMMAR_CORRECTION"];

function selectedPassages(): PassageFixture[] {
  return HS_PASSAGE_DATA
    .flatMap((group) => group.passages.map((passage) => ({
      title: passage.title,
      content: passage.content.replace(/\s+/g, " ").trim(),
      grade: group.grade,
      semester: group.semester,
      source: passage.source,
    })))
    .filter((passage) => passage.content.length >= 700)
    .filter((passage) => !/\ban notorious\b/i.test(passage.content));
}

function buildCases(total: number): RunCase[] {
  const passages = selectedPassages();
  if (passages.length === 0) throw new Error("No passage fixtures available.");

  return Array.from({ length: total }, (_, index) => {
    const typeId = TYPES[index % TYPES.length];
    const difficulty = DIFFICULTIES[Math.floor(index / TYPES.length) % DIFFICULTIES.length];
    const passage = passages[(index * 7 + (typeId === "GRAMMAR_CORRECTION" ? 3 : 0)) % passages.length];
    if (typeId === "GRAMMAR_ERROR") {
      const markerCount = [5, 6, 7, 5, 6][index % 5];
      const answerCount = index % 20 === 0 ? 2 : 1;
      return {
        index: index + 1,
        typeId,
        difficulty,
        passage,
        grammarMarkerCount: markerCount,
        grammarAnswerCount: Math.min(answerCount, markerCount),
      };
    }
    return {
      index: index + 1,
      typeId,
      difficulty,
      passage,
      grammarCorrectionErrorCount: index % 24 === 1 ? 2 : 1,
    };
  });
}

function difficultyInstruction(difficulty: Difficulty) {
  if (difficulty === "BASIC") return "direct high-school grammar item with clear source evidence";
  if (difficulty === "INTERMEDIATE") return "mid-level grammar item requiring clause or phrase analysis";
  return "top-tier grammar item requiring precise structural analysis and source evidence";
}

function checkJsonRoundTrip(question: Record<string, unknown> | undefined) {
  if (!question) return { ok: false, error: "no question" };
  try {
    JSON.parse(JSON.stringify(question));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function checkRenderer(question: Record<string, unknown> | undefined) {
  if (!question) return { ok: false, error: "no question" };
  try {
    const html = renderToStaticMarkup(
      React.createElement(StructuredQuestionRenderer, {
        question,
        index: 0,
        hideHeader: true,
      }),
    );
    return {
      ok: html.trim().length > 0,
      error: html.trim().length > 0 ? undefined : "empty renderer output",
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function runOne(testCase: RunCase): Promise<SampleResult> {
  const startedAt = Date.now();
  const typeSettings =
    testCase.typeId === "GRAMMAR_ERROR"
      ? {
          GRAMMAR_ERROR: {
            markerCount: testCase.grammarMarkerCount,
            answerCount: testCase.grammarAnswerCount,
          },
        }
      : {
          GRAMMAR_CORRECTION: {
            errorCount: testCase.grammarCorrectionErrorCount,
          },
        };

  console.log(
    `[grammar-audit] #${testCase.index}/${TOTAL} ${testCase.typeId} ${testCase.difficulty} :: ${testCase.passage.title}`,
  );

  let generationResult: Awaited<ReturnType<typeof runQuestionGenerationWithEmptyRetry>>;
  try {
    generationResult = await runQuestionGenerationWithEmptyRetry({
      plan: [
        {
          subType: testCase.typeId,
          count: 1,
          reason: "100-sample grammar generation audit",
          targetPoints: [],
        },
      ],
      schoolType: "high school",
      gradeInfo: `grade ${testCase.passage.grade}`,
      passageContent: testCase.passage.content,
      teacherIntentBlock: "",
      analysisContext: "",
      diffLabel: testCase.difficulty,
      diffInstruction: difficultyInstruction(testCase.difficulty),
      generationPlan: "STANDARD",
      typeSettings,
    }, {
      logPrefix: "GRAMMAR-100-AUDIT",
      maxAttempts: MAX_ATTEMPTS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      index: testCase.index,
      typeId: testCase.typeId,
      difficulty: testCase.difficulty,
      passageTitle: testCase.passage.title,
      settings: caseSettings(testCase),
      ok: false,
      attempts: 0,
      relaxedFallback: false,
      ms: Date.now() - startedAt,
      qualityErrors: [],
      qualityWarnings: [],
      auditErrors: [{ severity: "error", code: "generation-exception", message }],
      auditWarnings: [],
      renderOk: false,
      renderError: message,
      jsonOk: false,
      jsonError: message,
      rejectionSummary: null,
      answerPointCodes: [],
      markedPointCodes: [],
    };
  }

  const question = generationResult.questions[0];
  const qualityIssues = question
    ? validateQuestionQuality({
        typeId: testCase.typeId,
        question,
        passage: testCase.passage.content,
        requestedDifficulty: testCase.difficulty,
        grammarMarkerCount: testCase.grammarMarkerCount,
        grammarAnswerCount: testCase.grammarAnswerCount,
        grammarCorrectionErrorCount: testCase.grammarCorrectionErrorCount,
      })
    : [];
  const qualityErrors = qualityIssues.filter((issue) => issue.severity === "error");
  const qualityWarnings = qualityIssues.filter((issue) => issue.severity === "warning");
  const json = checkJsonRoundTrip(question);
  const render = checkRenderer(question);
  const subtypeAudit = question
    ? testCase.typeId === "GRAMMAR_ERROR"
      ? auditGrammarError(question, testCase.passage.content)
      : auditGrammarCorrection(question, testCase.passage.content)
    : {
        auditErrors: [{ severity: "error" as const, code: "missing-question", message: "No generated question." }],
        auditWarnings: [] as AuditIssue[],
        answerPointCodes: [] as string[],
        markedPointCodes: [] as string[],
      };

  const ok =
    generationResult.questions.length === 1 &&
    qualityErrors.length === 0 &&
    subtypeAudit.auditErrors.length === 0 &&
    json.ok &&
    render.ok;

  console.log(
    `[grammar-audit] #${testCase.index} done ok=${ok ? "yes" : "no"} attempts=${generationResult.attempts} e=${qualityErrors.length + subtypeAudit.auditErrors.length} w=${qualityWarnings.length + subtypeAudit.auditWarnings.length} ms=${Date.now() - startedAt}`,
  );

  return {
    index: testCase.index,
    typeId: testCase.typeId,
    difficulty: testCase.difficulty,
    passageTitle: testCase.passage.title,
    settings: caseSettings(testCase),
    ok,
    attempts: generationResult.attempts,
    relaxedFallback: generationResult.relaxedFallback,
    ms: Date.now() - startedAt,
    qualityErrors,
    qualityWarnings,
    auditErrors: subtypeAudit.auditErrors,
    auditWarnings: subtypeAudit.auditWarnings,
    renderOk: render.ok,
    renderError: render.error,
    jsonOk: json.ok,
    jsonError: json.error,
    rejectionSummary: generationResult.rejectionSummary,
    answerPointCodes: subtypeAudit.answerPointCodes,
    markedPointCodes: subtypeAudit.markedPointCodes,
    labelAudits: "labelAudits" in subtypeAudit ? subtypeAudit.labelAudits : undefined,
    segmentAudits: "segmentAudits" in subtypeAudit ? subtypeAudit.segmentAudits : undefined,
    question,
  };
}

function caseSettings(testCase: RunCase) {
  return {
    grammarMarkerCount: testCase.grammarMarkerCount,
    grammarAnswerCount: testCase.grammarAnswerCount,
    grammarCorrectionErrorCount: testCase.grammarCorrectionErrorCount,
  };
}

function auditGrammarError(question: Record<string, unknown>, passage: string) {
  const auditErrors: AuditIssue[] = [];
  const auditWarnings: AuditIssue[] = [];
  const marked = Array.isArray(question.markedExpressions)
    ? question.markedExpressions.filter(isRecord)
    : [];
  const options = Array.isArray(question.options)
    ? question.options.filter(isRecord)
    : [];
  const optionByLabel = new Map(options.map((option) => [normalizeLabel(option.label), option]));
  const wrongExplanations = collectWrongOptionExplanations(question.wrongOptionExplanations);
  const passageWithMarkers = normalizeText(question.passageWithMarkers);
  const answerLabels = collectCorrectAnswerLabels(question);
  const labelAudits: LabelAudit[] = [];
  const markedPointCodes: string[] = [];
  const answerPointCodes: string[] = [];

  if (marked.length === 0) {
    auditErrors.push({ severity: "error", code: "grammar-audit-missing-marked", message: "No markedExpressions." });
  }

  for (const item of marked) {
    const label = normalizeLabel(item.label).toUpperCase();
    const option = optionByLabel.get(label.toLowerCase());
    const expression = normalizeText(item.expression);
    const errorExpression = normalizeText(item.errorExpression);
    const correction = normalizeText(item.correction || item.expression);
    const pointCode = normalizeText(item.pointCode).toLowerCase();
    const isError = item.isError === true;
    const optionText = normalizeText(option?.text);
    const issues: AuditIssue[] = [];
    if (pointCode) markedPointCodes.push(pointCode);
    if (isError && pointCode) answerPointCodes.push(pointCode);

    const sourceBacked = containsLoose(passage, correction || expression);
    const renderedSurface = isError ? errorExpression : expression;
    const rendered = !!renderedSurface && containsLoose(passageWithMarkers, renderedSurface);
    const explanationPresent = isError
      ? normalizeText(question.explanation).length >= 30
      : !!wrongExplanations.get(label.toLowerCase());

    if (!option) {
      issues.push({ severity: "error", code: "grammar-audit-option-missing", label, message: "No matching option for marked label." });
    }
    if (!expression) {
      issues.push({ severity: "error", code: "grammar-audit-expression-missing", label, message: "Missing expression." });
    }
    if (!pointCode || !/^[a-m]$/.test(pointCode)) {
      issues.push({ severity: "error", code: "grammar-audit-point-code", label, message: `Invalid pointCode: ${pointCode || "empty"}.` });
    }
    if (!sourceBacked) {
      issues.push({ severity: "error", code: "grammar-audit-source-backed", label, message: "Correction/source expression is not found in the original passage." });
    }
    if (!rendered) {
      issues.push({ severity: "error", code: "grammar-audit-rendered-surface", label, message: "Displayed option surface is not found in passageWithMarkers." });
    }
    if (!explanationPresent) {
      issues.push({ severity: "error", code: "grammar-audit-explanation-missing", label, message: "Missing explanation for this label." });
    }
    if (isError) {
      if (!errorExpression) {
        issues.push({ severity: "error", code: "grammar-audit-error-expression-missing", label, message: "Answer label is missing errorExpression." });
      }
      if (normalizeComparableText(errorExpression) === normalizeComparableText(correction || expression)) {
        issues.push({ severity: "error", code: "grammar-audit-error-not-mutated", label, message: "errorExpression does not differ from correction/source expression." });
      }
      if (optionText && !containsComparable(optionText, errorExpression)) {
        issues.push({ severity: "warning", code: "grammar-audit-option-error-text", label, message: "Option text does not clearly match the introduced errorExpression." });
      }
      if (!answerLabels.includes(label.toLowerCase())) {
        issues.push({ severity: "error", code: "grammar-audit-answer-label", label, message: "isError=true label is not included in correctAnswer/correctAnswers." });
      }
    } else {
      if (optionText && expression && !containsComparable(optionText, expression)) {
        issues.push({ severity: "warning", code: "grammar-audit-decoy-option-text", label, message: "Non-answer option text does not clearly match the source expression." });
      }
    }

    for (const issue of issues) {
      (issue.severity === "error" ? auditErrors : auditWarnings).push(issue);
    }
    labelAudits.push({
      label,
      optionText,
      expression,
      errorExpression,
      correction,
      pointCode,
      isError,
      sourceBacked,
      rendered,
      explanationPresent,
      issues,
    });
  }

  if (markedPointCodes.length >= 5 && new Set(markedPointCodes).size < 3) {
    auditWarnings.push({
      severity: "warning",
      code: "grammar-audit-low-point-diversity",
      message: "Marked expressions use fewer than three grammar point codes.",
    });
  }

  return {
    auditErrors,
    auditWarnings,
    answerPointCodes,
    markedPointCodes,
    labelAudits,
  };
}

function auditGrammarCorrection(question: Record<string, unknown>, passage: string) {
  const auditErrors: AuditIssue[] = [];
  const auditWarnings: AuditIssue[] = [];
  const segments = Array.isArray(question.underlinedSegments)
    ? question.underlinedSegments.filter(isRecord)
    : [];
  const passageWithUnderline = normalizeText(question.passageWithUnderline);
  const explanation = normalizeText(question.explanation);
  const segmentAudits: SegmentAudit[] = [];

  if (segments.length === 0) {
    auditErrors.push({ severity: "error", code: "grammar-correction-audit-missing-segments", message: "No underlinedSegments." });
  }

  for (const [index, segment] of segments.entries()) {
    const label = normalizeLabel(segment.label || String.fromCharCode(65 + index)).toUpperCase();
    const sourceText = normalizeText(segment.sourceText);
    const displayedText = normalizeText(segment.displayedText);
    const errorPart = normalizeText(segment.errorPart);
    const correctedPart = normalizeText(segment.correctedPart);
    const issues: AuditIssue[] = [];
    const sourceBacked = !!sourceText && containsLoose(passage, sourceText);
    const rendered = !!displayedText && containsLoose(passageWithUnderline, displayedText);
    const wideEnough = countWords(displayedText) >= Math.max(7, countWords(errorPart) + 4);
    const explanationPresent =
      explanation.length >= 30 &&
      (!correctedPart || containsComparable(explanation, correctedPart) || containsComparable(normalizeText(question.correctAnswer), correctedPart));

    if (!sourceText) {
      issues.push({ severity: "error", code: "grammar-correction-audit-source-missing", label, message: "Missing sourceText." });
    }
    if (!displayedText) {
      issues.push({ severity: "error", code: "grammar-correction-audit-displayed-missing", label, message: "Missing displayedText." });
    }
    if (!errorPart) {
      issues.push({ severity: "error", code: "grammar-correction-audit-error-part-missing", label, message: "Missing errorPart." });
    }
    if (!correctedPart) {
      issues.push({ severity: "error", code: "grammar-correction-audit-corrected-part-missing", label, message: "Missing correctedPart." });
    }
    if (!sourceBacked) {
      issues.push({ severity: "error", code: "grammar-correction-audit-source-backed", label, message: "sourceText is not found in original passage." });
    }
    if (!rendered) {
      issues.push({ severity: "error", code: "grammar-correction-audit-rendered", label, message: "displayedText is not rendered in passageWithUnderline." });
    }
    if (errorPart && displayedText && !containsLoose(displayedText, errorPart)) {
      issues.push({ severity: "error", code: "grammar-correction-audit-error-in-displayed", label, message: "errorPart is not inside displayedText." });
    }
    if (correctedPart && sourceText && !containsLoose(sourceText, correctedPart)) {
      issues.push({ severity: "error", code: "grammar-correction-audit-correction-in-source", label, message: "correctedPart is not inside sourceText." });
    }
    if (normalizeComparableText(errorPart) === normalizeComparableText(correctedPart)) {
      issues.push({ severity: "error", code: "grammar-correction-audit-not-mutated", label, message: "errorPart equals correctedPart." });
    }
    if (!wideEnough) {
      issues.push({ severity: "warning", code: "grammar-correction-audit-width", label, message: "Underline segment is wide enough for the hard gate but still looks narrow for audit standards." });
    }
    if (!explanationPresent) {
      issues.push({ severity: "warning", code: "grammar-correction-audit-explanation", label, message: "Explanation does not clearly mention the correction." });
    }

    for (const issue of issues) {
      (issue.severity === "error" ? auditErrors : auditWarnings).push(issue);
    }
    segmentAudits.push({
      label,
      sourceText,
      displayedText,
      errorPart,
      correctedPart,
      sourceBacked,
      rendered,
      wideEnough,
      explanationPresent,
      issues,
    });
  }

  return {
    auditErrors,
    auditWarnings,
    answerPointCodes: [] as string[],
    markedPointCodes: [] as string[],
    segmentAudits,
  };
}

function collectWrongOptionExplanations(value: unknown): Map<string, string> {
  const explanations = new Map<string, string>();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isRecord(item)) continue;
      const label = normalizeLabel(item.label);
      const explanation = normalizeText(item.explanation);
      if (label && explanation) explanations.set(label, explanation);
    }
    return explanations;
  }
  if (!isRecord(value)) return explanations;
  for (const [label, explanation] of Object.entries(value)) {
    const normalizedLabel = normalizeLabel(label);
    const normalizedExplanation = normalizeText(explanation);
    if (normalizedLabel && normalizedExplanation) {
      explanations.set(normalizedLabel, normalizedExplanation);
    }
  }
  return explanations;
}

function collectCorrectAnswerLabels(question: Record<string, unknown>): string[] {
  const labels: string[] = [];
  const add = (value: unknown) => {
    const normalized = normalizeLabel(value);
    if (normalized && !labels.includes(normalized)) labels.push(normalized);
  };
  if (Array.isArray(question.correctAnswers)) {
    for (const answer of question.correctAnswers) add(answer);
  }
  const text = normalizeText(question.correctAnswer);
  for (const match of text.matchAll(/[\(\[]?\s*([A-Ja-j]|\d{1,3})\s*[\)\].:]?/g)) {
    add(match[1]);
  }
  return labels;
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function writeReports(results: SampleResult[]) {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const summary = buildSummary(results);
  const jsonPath = path.join(OUTDIR, `grammar-generation-100-audit-${RUN_ID}.json`);
  const mdPath = path.join(OUTDIR, `grammar-generation-100-audit-${RUN_ID}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify({ summary, results }, null, 2), "utf8");
  fs.writeFileSync(mdPath, renderMarkdown(summary, results), "utf8");
  return { jsonPath, mdPath, summary };
}

function buildSummary(results: SampleResult[]) {
  const byTypeDifficulty = new Map<string, { total: number; ok: number; errors: number; warnings: number }>();
  const issueCounts = new Map<string, number>();
  const answerPointCounts = new Map<string, number>();
  const markedPointCounts = new Map<string, number>();
  let relaxedFallbacks = 0;
  let totalAttempts = 0;
  for (const result of results) {
    const key = `${result.typeId}/${result.difficulty}`;
    const bucket = byTypeDifficulty.get(key) || { total: 0, ok: 0, errors: 0, warnings: 0 };
    bucket.total += 1;
    if (result.ok) bucket.ok += 1;
    bucket.errors += result.qualityErrors.length + result.auditErrors.length;
    bucket.warnings += result.qualityWarnings.length + result.auditWarnings.length;
    byTypeDifficulty.set(key, bucket);
    if (result.relaxedFallback) relaxedFallbacks += 1;
    totalAttempts += result.attempts;
    for (const issue of [
      ...result.qualityErrors,
      ...result.qualityWarnings,
      ...result.auditErrors,
      ...result.auditWarnings,
    ]) {
      issueCounts.set(issue.code, (issueCounts.get(issue.code) || 0) + 1);
    }
    for (const code of result.answerPointCodes) {
      answerPointCounts.set(code, (answerPointCounts.get(code) || 0) + 1);
    }
    for (const code of result.markedPointCodes) {
      markedPointCounts.set(code, (markedPointCounts.get(code) || 0) + 1);
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    total: results.length,
    ok: results.filter((result) => result.ok).length,
    failures: results.filter((result) => !result.ok).length,
    relaxedFallbacks,
    averageAttempts: round(totalAttempts / Math.max(1, results.length), 2),
    averageMs: Math.round(results.reduce((sum, result) => sum + result.ms, 0) / Math.max(1, results.length)),
    byTypeDifficulty: Object.fromEntries([...byTypeDifficulty.entries()].sort()),
    topIssues: topEntries(issueCounts, 20),
    answerPointCodes: topEntries(answerPointCounts, 20),
    markedPointCodes: topEntries(markedPointCounts, 20),
  };
}

function renderMarkdown(summary: ReturnType<typeof buildSummary>, results: SampleResult[]) {
  const lines = [
    "# Grammar Generation 100-Sample Audit",
    "",
    `- Generated at: ${summary.generatedAt}`,
    `- Total: ${summary.total}`,
    `- Passed: ${summary.ok}`,
    `- Failed: ${summary.failures}`,
    `- Relaxed fallbacks: ${summary.relaxedFallbacks}`,
    `- Average attempts: ${summary.averageAttempts}`,
    `- Average ms: ${summary.averageMs}`,
    "",
    "## By Type / Difficulty",
    "",
  ];
  for (const [key, value] of Object.entries(summary.byTypeDifficulty)) {
    lines.push(`- ${key}: ${value.ok}/${value.total} ok, errors ${value.errors}, warnings ${value.warnings}`);
  }
  lines.push("", "## Top Issues", "");
  if (summary.topIssues.length === 0) lines.push("- none");
  for (const item of summary.topIssues) lines.push(`- ${item.name}: ${item.count}`);
  lines.push("", "## GRAMMAR_ERROR Answer Point Codes", "");
  if (summary.answerPointCodes.length === 0) lines.push("- none");
  for (const item of summary.answerPointCodes) lines.push(`- ${item.name}: ${item.count}`);
  lines.push("", "## GRAMMAR_ERROR Marked Point Codes", "");
  if (summary.markedPointCodes.length === 0) lines.push("- none");
  for (const item of summary.markedPointCodes) lines.push(`- ${item.name}: ${item.count}`);
  lines.push("", "## Failed / Warned Samples", "");
  const notable = results.filter((result) =>
    !result.ok ||
    result.qualityWarnings.length > 0 ||
    result.auditWarnings.length > 0 ||
    result.relaxedFallback,
  );
  if (notable.length === 0) {
    lines.push("- none");
  }
  for (const result of notable.slice(0, 80)) {
    lines.push(
      `- #${result.index} ${result.typeId}/${result.difficulty} ${result.passageTitle}: ok=${result.ok} attempts=${result.attempts} relaxed=${result.relaxedFallback}`,
    );
    for (const issue of [
      ...result.qualityErrors,
      ...result.auditErrors,
      ...result.qualityWarnings,
      ...result.auditWarnings,
    ]) {
      lines.push(`  - ${issue.severity} ${issue.code}${"label" in issue && issue.label ? ` ${issue.label}` : ""}: ${issue.message}`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function topEntries(map: Map<string, number>, limit: number) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function normalizeLabel(value: unknown): string {
  return normalizeText(value)
    .replace(/^[\(\[]?([A-Ja-j]|\d{1,3})[\)\].:]?\s*$/, "$1")
    .toLowerCase();
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeComparableText(value: unknown): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^a-z0-9가-힣]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsComparable(text: unknown, fragment: unknown): boolean {
  const comparableText = normalizeComparableText(text);
  const comparableFragment = normalizeComparableText(fragment);
  return !!comparableFragment && comparableText.includes(comparableFragment);
}

function containsLoose(text: unknown, fragment: unknown): boolean {
  return containsComparable(text, fragment);
}

function countWords(text: unknown): number {
  return normalizeText(text).split(/\s+/).filter(Boolean).length;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function main() {
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY is required.");
  }
  const cases = buildCases(TOTAL);
  console.log(
    `[grammar-audit] start total=${TOTAL} concurrency=${CONCURRENCY} maxAttempts=${MAX_ATTEMPTS} passages=${selectedPassages().length} runId=${RUN_ID}`,
  );
  const startedAt = Date.now();
  const results = await runWithConcurrency(cases, CONCURRENCY, runOne);
  const { jsonPath, mdPath, summary } = writeReports(results);
  console.log("\n========== GRAMMAR GENERATION SAMPLE AUDIT ==========");
  console.log(`ok=${summary.ok}/${summary.total} failed=${summary.failures} relaxed=${summary.relaxedFallbacks} avgAttempts=${summary.averageAttempts} avgMs=${summary.averageMs}`);
  console.log(`json=${jsonPath}`);
  console.log(`md=${mdPath}`);
  if (summary.failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
