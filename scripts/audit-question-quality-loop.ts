/**
 * Generic real-LLM question-quality audit harness (all 26 English types).
 *
 * Modeled on scripts/audit-grammar-quality-loop.ts (do NOT modify that file —
 * tests depend on it). This loop iterates type -> plan -> difficulty ->
 * passage cells, generates one question per run against the read-only prod
 * DB passages, then cross-model LLM-judges the result.
 *
 * Run with: NODE_OPTIONS="" npx tsx scripts/audit-question-quality-loop.ts
 *
 * ENV:
 *  AUDIT_LOOP_TYPES          CSV of type ids (default: all 26 English types)
 *  AUDIT_LOOP_PLANS          CSV of STANDARD,PREMIUM (default both)
 *  AUDIT_LOOP_DIFFICULTIES   CSV of BASIC,INTERMEDIATE,KILLER (default all)
 *  AUDIT_LOOP_RUNS           runs PER CELL (type:plan:difficulty), default 1
 *  AUDIT_LOOP_MAX_RUNS       optional global safety cap on total runs
 *  AUDIT_LOOP_PASSAGES       passage pool size (default 10)
 *  AUDIT_LOOP_ATTEMPTS       generation maxAttempts (default 2)
 *  AUDIT_LOOP_LLM_JUDGE      default true
 *  AUDIT_LOOP_ACADEMY_ID     default cmommhl7a0000mmekxmbqfefe
 *  AUDIT_LOOP_OUT            jsonl output path
 *  AUDIT_LOOP_SETTINGS_JSON  optional JSON of per-type typeSettings overrides,
 *                            e.g. {"BLANK_INFERENCE":{"blankCount":2}} — merged
 *                            over the default/base settings for that type only.
 *                            Unset = identical behavior to before (no override).
 *  AUDIT_LOOP_PASS_SCORE     LLM judge pass threshold (default 95)
 *  AUDIT_LOOP_SUMMARY_ONLY   path to an existing jsonl -> offline summary only
 *  AUDIT_LOOP_SUMMARY_OUT    summary output path (with SUMMARY_ONLY)
 */
import fs from "node:fs";
import path from "node:path";

import { loadEnvConfig } from "@next/env";
import { z } from "zod";

loadEnvConfig(process.cwd());

type GenerationPlan = "STANDARD" | "PREMIUM";
type Difficulty = "BASIC" | "INTERMEDIATE" | "KILLER";

type LocalIssue = {
  severity: "critical" | "major" | "minor";
  code: string;
  message: string;
};

type AuditRow = Record<string, unknown>;

const DEFAULT_ACADEMY_ID = "cmommhl7a0000mmekxmbqfefe";
const DEFAULT_PASS_SCORE = 95;

const ALL_TYPES = [
  "BLANK_INFERENCE",
  "GRAMMAR_ERROR",
  "GRAMMAR_CHOICE_COMBO",
  "VOCAB_CHOICE",
  "SENTENCE_ORDER",
  "SENTENCE_INSERT",
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "IMPLIED_MEANING",
  "REFERENCE",
  "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC",
  "IRRELEVANT",
  "CONTEXT_MEANING",
  "SYNONYM",
  "ANTONYM",
  "CONDITIONAL_WRITING",
  "SENTENCE_TRANSFORM",
  "FILL_BLANK_KEY",
  "SUMMARY_COMPLETE",
  "SUMMARY_WRITING",
  "WORD_ORDER",
  "TOPIC_SENTENCE_WRITING",
  "GRAMMAR_CORRECTION",
] as const;

type AuditType = (typeof ALL_TYPES)[number];

// Difficulty presets must drive real differentiation for these types.
// Pinning setting values shadows the presets (documented trap in
// src/lib/question-type-generation-settings/dispatchers.ts) — pass {}.
const EMPTY_SETTINGS_TYPES = new Set<AuditType>([
  "SUMMARY_WRITING",
  "TOPIC_SENTENCE_WRITING",
]);

type TypeConfig = {
  /** Extra per-run settings. When undefined the runtime default
   *  (getDefaultQuestionTypeGenerationSettings()[type] ?? {}) is used. */
  settings?: Record<string, unknown>;
  /** Type-specific deterministic audit. Default: generic fallback. */
  localAudit?: (args: {
    question: Record<string, unknown>;
    difficulty: Difficulty;
    passage?: string;
  }) => { score: number; pass: boolean; issues: LocalIssue[] };
  /** Field-semantics note appended to the judge prompt. */
  judgeSchemaNote?: string;
  /** Compact answer surfaces for the jsonl/summary. Default: generic. */
  answerSurfaceExtractor?: (question: Record<string, unknown>) => string[];
};

const WRITING_TYPE_NOTE =
  "- This is a constructed-response (서술형) item: modelAnswer (and answerText/correctAnswer where present) is the answer key; there may be no five answer choices. Judge condition design, blank/chip design, answer-key naturalness, and explanation quality instead of a distractor set.";

const TYPE_CONFIGS: Record<AuditType, TypeConfig> = {
  BLANK_INFERENCE: {},
  GRAMMAR_ERROR: {
    judgeSchemaNote: [
      "- For markedExpressions where isError=true, expression/correction are the ORIGINAL correct source form, and errorExpression is the student-visible wrong form.",
      "- Do NOT fail merely because expression differs from errorExpression. Fail only if the visible passage/options/explanation contradict each other.",
    ].join("\n"),
    answerSurfaceExtractor: (question) => {
      const marked = Array.isArray(question.markedExpressions)
        ? question.markedExpressions
        : [];
      const surfaces = marked
        .filter(isRecord)
        .filter(
          (item) =>
            item.isError === true ||
            text(item.isError).toLowerCase() === "true",
        )
        .map((item) => {
          const label = text(item.label) || "?";
          const expression = text(item.expression);
          const errorExpression = text(item.errorExpression);
          return `${label}:${expression}${errorExpression ? `->${errorExpression}` : ""}`;
        })
        .filter(Boolean)
        .slice(0, 3);
      return surfaces.length > 0 ? surfaces : extractGenericAnswerSurfaces(question);
    },
  },
  GRAMMAR_CHOICE_COMBO: {
    judgeSchemaNote:
      "- slots[].correctExpression is verbatim passage text; slots[].wrongExpression is the boxed wrong candidate and does not need to exist in the source passage.",
  },
  VOCAB_CHOICE: {
    judgeSchemaNote: [
      "- markedWords[].originalWord is the verbatim source word; substituteWord is the replacement displayed in the passage; betterWord (when present) is the recommended fix for the inappropriate word.",
      "- Exactly one marked word should be contextually inappropriate. Do NOT fail because substituteWord is absent from the original passage — it is a displayed replacement by design.",
    ].join("\n"),
  },
  SENTENCE_ORDER: {
    judgeSchemaNote:
      "- givenSentence is the opening chunk and may be a light paraphrase/prefix of the passage opening; (A)/(B)/(C) are reordered verbatim chunks. Do not fail solely because givenSentence is not verbatim.",
  },
  SENTENCE_INSERT: {
    judgeSchemaNote: [
      "- sourceSentenceToOmit is the verbatim original sentence removed from the displayed passage; givenSentence may be a lightly paraphrased version of that sentence.",
      "- Do NOT fail because givenSentence is not verbatim source text; fail only if the paraphrase changes meaning or breaks the cohesive cues.",
    ].join("\n"),
  },
  TOPIC: {},
  MAIN_IDEA: {},
  TOPIC_MAIN_IDEA: {},
  TITLE: {},
  IMPLIED_MEANING: {},
  REFERENCE: {},
  CONTENT_MATCH: {},
  SUMMARY_COMPLETE_MC: {
    judgeSchemaNote:
      "- CSAT-style two-blank summary: options are (A)/(B) word pairs. Judge whether half-correct traps are genuinely competitive and the filled summary reads as native English.",
  },
  IRRELEVANT: {},
  CONTEXT_MEANING: {},
  SYNONYM: {},
  ANTONYM: {
    judgeSchemaNote:
      "- This is a 'wrong antonym pair' item: exactly one word-pair is incorrectly matched and correctAntonym gives the decisive fix; the other pairs must be clean contextual antonyms.",
  },
  CONDITIONAL_WRITING: { judgeSchemaNote: WRITING_TYPE_NOTE },
  SENTENCE_TRANSFORM: { judgeSchemaNote: WRITING_TYPE_NOTE },
  FILL_BLANK_KEY: { judgeSchemaNote: WRITING_TYPE_NOTE },
  SUMMARY_COMPLETE: { judgeSchemaNote: WRITING_TYPE_NOTE },
  SUMMARY_WRITING: {
    settings: {},
    judgeSchemaNote: [
      WRITING_TYPE_NOTE,
      "- modelAnswer is the answer key for the summary blanks; the blank answers must not appear verbatim inside the displayed summary/hints.",
    ].join("\n"),
  },
  WORD_ORDER: {
    judgeSchemaNote: [
      WRITING_TYPE_NOTE,
      "- scrambledWords are the shuffled chips; the modelAnswer is the target sentence. Fail if the scrambled order already equals the answer or punctuation-only chips exist.",
    ].join("\n"),
  },
  TOPIC_SENTENCE_WRITING: {
    settings: {},
    judgeSchemaNote: [
      WRITING_TYPE_NOTE,
      "- Exactly one mode is populated: scrambledWords (chips) OR summaryWithBlanks+blanks (cloze). modelAnswer is the complete topic sentence/noun phrase and must stay synchronized with correctAnswer.",
    ].join("\n"),
  },
  GRAMMAR_CORRECTION: {
    judgeSchemaNote: [
      WRITING_TYPE_NOTE,
      "- underlinedSegments[].sourceText is the original correct segment; displayedText is the same segment with one grammar mutation shown to students; errorPart is the wrong word hidden inside the wider underline.",
    ].join("\n"),
  },
};

const LlmJudgeSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  score: z.number().min(0).max(100),
  fatalIssues: z.array(z.string()).default([]),
  majorIssues: z.array(z.string()).default([]),
  minorIssues: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
  improvementHint: z.string().default(""),
});

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readBoolEnv(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return /^(1|true|yes|y)$/i.test(raw.trim());
}

function readListEnv<T extends string>(
  name: string,
  allowed: readonly T[],
  fallback: readonly T[],
): T[] {
  const raw = process.env[name];
  if (!raw) return [...fallback];
  const allowedSet = new Set(allowed);
  const out = raw
    .split(",")
    .map((item) => item.trim().toUpperCase() as T)
    .filter((item) => allowedSet.has(item));
  return out.length > 0 ? out : [...fallback];
}

/**
 * AUDIT_LOOP_SETTINGS_JSON reader (additive; unset -> null -> no behavior
 * change). Shape: { [typeId]: { settingKey: value } }. Invalid JSON fails
 * fast so a typo cannot silently measure the default configuration.
 */
function readSettingsOverridesEnv(
  name: string,
): Record<string, Record<string, unknown>> | null {
  const raw = process.env[name];
  if (!raw || !raw.trim()) return null;
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`${name} must be a JSON object keyed by type id.`);
  }
  const out: Record<string, Record<string, unknown>> = {};
  for (const [typeId, value] of Object.entries(parsed)) {
    if (!isRecord(value)) {
      throw new Error(`${name}.${typeId} must be a JSON object of settings.`);
    }
    out[typeId.toUpperCase()] = value;
  }
  return out;
}

function isCreditsDepletedError(message: string): boolean {
  return (
    /\b402\b/.test(message) ||
    /payment\s+required/i.test(message) ||
    /insufficient\s+credits?/i.test(message) ||
    /credits?\s+(?:depleted|exhausted)/i.test(message) ||
    /(?:out of|no remaining)\s+credits?/i.test(message)
  );
}

function extractGenericAnswerSurfaces(
  question: Record<string, unknown>,
): string[] {
  const surfaces: string[] = [];
  const push = (value: unknown) => {
    let surface = "";
    if (typeof value === "string" || typeof value === "number") {
      surface = String(value).replace(/\s+/g, " ").trim();
    } else if (Array.isArray(value) || isRecord(value)) {
      surface = JSON.stringify(value);
    }
    surface = surface.slice(0, 200);
    if (surface && !surfaces.includes(surface)) surfaces.push(surface);
  };
  if (Array.isArray(question.correctAnswers)) {
    for (const value of question.correctAnswers) push(value);
  } else if (question.correctAnswers !== undefined) {
    push(question.correctAnswers);
  }
  push(question.correctAnswer);
  push(question.modelAnswer);
  return surfaces.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Generic deterministic local audit (fallback for every type)
// ---------------------------------------------------------------------------

function auditLocalGenericQuestion({
  question,
}: {
  question: Record<string, unknown>;
  difficulty: Difficulty;
  passage?: string;
}): { score: number; pass: boolean; issues: LocalIssue[] } {
  const issues: LocalIssue[] = [];
  const add = (severity: LocalIssue["severity"], code: string, message: string) => {
    issues.push({ severity, code, message });
  };

  const structuredData = isRecord(question.structuredData)
    ? question.structuredData
    : null;
  const qualityMode =
    text(question._qualityMode) || text(structuredData?._qualityMode);
  if (qualityMode === "relaxed" || qualityMode === "scarce") {
    add(
      "critical",
      `quality-mode-${qualityMode}`,
      `Generation fell back to _qualityMode=${qualityMode} (low-quality signal).`,
    );
  } else if (qualityMode && qualityMode !== "strict") {
    add(
      "major",
      `quality-mode-${qualityMode}`,
      `Generation reports non-strict _qualityMode=${qualityMode}.`,
    );
  }
  const notice =
    text(question._generationNotice) || text(structuredData?._generationNotice);
  if (notice) {
    add("minor", "generation-notice", `_generationNotice: ${notice.slice(0, 200)}`);
  }
  if (
    question._reviewRecommended === true ||
    structuredData?._reviewRecommended === true
  ) {
    add("minor", "review-recommended", "_reviewRecommended flag set by the generator.");
  }

  let score = 100;
  for (const issue of issues) {
    score -= issue.severity === "critical" ? 35 : issue.severity === "major" ? 15 : 5;
  }
  score = Math.max(0, score);
  return {
    score,
    pass: !issues.some((issue) => issue.severity !== "minor"),
    issues,
  };
}

// ---------------------------------------------------------------------------
// Summary (offline-capable)
// ---------------------------------------------------------------------------

function readJsonlRows(inputPath: string): AuditRow[] {
  const content = fs.readFileSync(inputPath, "utf8");
  const rows: AuditRow[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = JSON.parse(trimmed) as unknown;
    if (isRecord(parsed)) rows.push(parsed);
  }
  return rows;
}

function defaultSummaryPath(inputPath: string): string {
  return /\.jsonl$/i.test(inputPath)
    ? inputPath.replace(/\.jsonl$/i, ".summary.json")
    : `${inputPath}.summary.json`;
}

function rowText(row: AuditRow, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function rowNumber(row: AuditRow, key: string): number | null {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function issueKey(source: string, code: string): string {
  return `${source}:${code.replace(/\s+/g, " ").trim().slice(0, 120)}`;
}

function collectRowIssueKeys(row: AuditRow): string[] {
  const keys: string[] = [];
  const push = (key: string) => {
    if (key && !keys.includes(key)) keys.push(key);
  };

  const localIssues = Array.isArray(row.localIssues) ? row.localIssues : [];
  for (const issue of localIssues) {
    if (isRecord(issue)) {
      const code = rowText(issue, "code");
      if (code) push(issueKey("local", code));
    } else if (typeof issue === "string" && issue.trim()) {
      push(issueKey("local", issue));
    }
  }
  for (const issue of Array.isArray(row.llmFatal) ? row.llmFatal : []) {
    if (typeof issue === "string") push(issueKey("llmFatal", issue));
  }
  for (const issue of Array.isArray(row.llmMajor) ? row.llmMajor : []) {
    if (typeof issue === "string") push(issueKey("llmMajor", issue));
  }
  if (typeof row.llmJudgeError === "string" && row.llmJudgeError.trim()) {
    push(issueKey("llmJudgeError", row.llmJudgeError));
  }
  if (typeof row.error === "string" && row.error.trim()) {
    push(issueKey("runtime", row.error));
  }
  return keys;
}

function collectRejectionIssueCounts(row: AuditRow): Record<string, number> {
  const out: Record<string, number> = {};
  const rejectionSummary = isRecord(row.rejectionSummary) ? row.rejectionSummary : null;
  const topCodes = Array.isArray(rejectionSummary?.topCodes) ? rejectionSummary.topCodes : [];
  for (const item of topCodes) {
    if (!isRecord(item)) continue;
    const code = rowText(item, "code");
    if (!code) continue;
    const count = Math.max(1, rowNumber(item, "count") ?? 1);
    const key = issueKey("rejection", code);
    out[key] = (out[key] ?? 0) + count;
  }
  const lastIssue = isRecord(rejectionSummary?.lastIssue) ? rejectionSummary.lastIssue : null;
  const lastCodes = Array.isArray(lastIssue?.codes) ? lastIssue.codes : [];
  for (const code of lastCodes) {
    if (typeof code !== "string" || !code.trim()) continue;
    const key = issueKey("rejectionLast", code);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

type CellSummary = {
  total: number;
  generated: number;
  passed: number;
  passRate: number;
  avgScore: number | null;
  topIssues: Array<{ code: string; count: number }>;
};

function topIssuesFromCounts(
  counts: Record<string, number>,
  limit: number,
): Array<{ code: string; count: number }> {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([code, count]) => ({ code, count }));
}

function buildAuditSummary(rows: AuditRow[], outPath: string) {
  const passed = rows.filter((row) => row.ok === true).length;
  const failed = rows.length - passed;
  const globalIssueCounts: Record<string, number> = {};
  const byCell: Record<string, CellSummary> = {};
  const cellIssueCounts: Record<string, Record<string, number>> = {};
  const cellScores: Record<string, number[]> = {};

  for (const row of rows) {
    const cellKey = [
      rowText(row, "type") || "UNKNOWN",
      rowText(row, "plan") || rowText(row, "generationPlan") || "UNKNOWN",
      rowText(row, "difficulty") || "UNKNOWN",
    ].join(":");
    const cell =
      byCell[cellKey] ??
      { total: 0, generated: 0, passed: 0, passRate: 0, avgScore: null, topIssues: [] };
    cell.total += 1;
    if (row.generated === true) cell.generated += 1;
    if (row.ok === true) cell.passed += 1;
    cell.passRate = cell.total > 0 ? cell.passed / cell.total : 0;
    byCell[cellKey] = cell;

    const llmScore = rowNumber(row, "llmScore");
    if (llmScore !== null) {
      (cellScores[cellKey] ??= []).push(llmScore);
    }

    const issueCounts = (cellIssueCounts[cellKey] ??= {});
    for (const key of collectRowIssueKeys(row)) {
      issueCounts[key] = (issueCounts[key] ?? 0) + 1;
      globalIssueCounts[key] = (globalIssueCounts[key] ?? 0) + 1;
    }
    for (const [key, count] of Object.entries(collectRejectionIssueCounts(row))) {
      issueCounts[key] = (issueCounts[key] ?? 0) + count;
      globalIssueCounts[key] = (globalIssueCounts[key] ?? 0) + count;
    }
  }

  for (const [cellKey, cell] of Object.entries(byCell)) {
    const scores = cellScores[cellKey] ?? [];
    cell.avgScore =
      scores.length > 0
        ? Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 10) / 10
        : null;
    cell.topIssues = topIssuesFromCounts(cellIssueCounts[cellKey] ?? {}, 5);
  }

  const worstSamples = rows
    .filter((row) => row.ok !== true)
    .map((row) => ({
      runIndex: row.runIndex,
      type: row.type,
      plan: row.plan ?? row.generationPlan,
      difficulty: row.difficulty,
      passageId: row.passageId,
      title: row.title,
      llmScore: rowNumber(row, "llmScore"),
      issueKeys: [
        ...collectRowIssueKeys(row),
        ...Object.keys(collectRejectionIssueCounts(row)),
      ].slice(0, 8),
      answerSurfaces: Array.isArray(row.answerSurfaces)
        ? row.answerSurfaces.slice(0, 3)
        : [],
      rejectionSummary: isRecord(row.rejectionSummary)
        ? row.rejectionSummary.message
        : undefined,
      error: row.error,
    }))
    .sort((a, b) => (a.llmScore ?? -1) - (b.llmScore ?? -1))
    .slice(0, 12);

  return {
    createdAt: new Date().toISOString(),
    outPath,
    total: rows.length,
    passed,
    failed,
    passRate: rows.length > 0 ? passed / rows.length : 0,
    byCell,
    topIssues: topIssuesFromCounts(globalIssueCounts, 20),
    issueCounts: globalIssueCounts,
    worstSamples,
  };
}

// ---------------------------------------------------------------------------
// Judge prompt (parameterized per type)
// ---------------------------------------------------------------------------

function buildJudgePrompt({
  type,
  typeLabel,
  qualityBar,
  difficultyRubric,
  judgeSchemaNote,
  passage,
  question,
  generationPlan,
  difficulty,
  localIssues,
}: {
  type: AuditType;
  typeLabel: string;
  qualityBar: string;
  difficultyRubric: string;
  judgeSchemaNote?: string;
  passage: string;
  question: Record<string, unknown>;
  generationPlan: GenerationPlan;
  difficulty: Difficulty;
  localIssues: LocalIssue[];
}) {
  return [
    `You are an adversarial Korean CSAT/내신 English item reviewer specialized in the "${typeLabel}" (${type}) question type.`,
    `Judge whether this generated ${type} item is genuinely publication-grade.`,
    "Be strict. Passing means a paying academy director would feel the item is elegant, unambiguous, and exam-like.",
    "Return ONLY compact JSON matching the schema. No markdown, no prose outside JSON.",
    "Keep each issue under 160 characters. Use at most 2 fatalIssues, 3 majorIssues, 2 minorIssues, 3 strengths.",
    "",
    "Fail if any of these are true:",
    "- the correct answer is not backed by the source passage, or is debatable / multiple options could be correct",
    "- distractors (or non-answer surfaces) are padding: shallow, obviously wrong, or not attractive",
    "- the explanation is vague, wrong, self-contradictory, or leaks generation meta/scratchpad reasoning",
    "- the difficulty label is not real: a KILLER that a mid-level student solves on a skim, or a BASIC that is accidentally ambiguous",
    "- any student-visible English is unnatural, broken, or reads as machine-generated filler",
    "- the item feels like AI-made formatting compliance rather than a genuine exam-style design",
    "",
    qualityBar ? `Type quality bar:\n${qualityBar}` : "",
    "",
    difficultyRubric ? `Difficulty rubric:\n${difficultyRubric}` : "",
    "",
    judgeSchemaNote ? `Schema note for this type:\n${judgeSchemaNote}` : "",
    "",
    "Scoring guide:",
    "95-100: excellent, 평가원-like, clean trap and elegant explanations",
    "90-94: usable but not breathtaking; verdict must be fail for this audit",
    "80-89: ordinary academy item",
    "<80: defective or too easy",
    "",
    `Generation plan: ${generationPlan}`,
    `Difficulty: ${difficulty}`,
    "",
    "Local deterministic issues:",
    JSON.stringify(localIssues, null, 2),
    "",
    "Original passage:",
    passage,
    "",
    "Generated question JSON:",
    JSON.stringify(question, null, 2),
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const summaryOnlyInput =
    process.env.AUDIT_LOOP_SUMMARY_ONLY ?? process.env.AUDIT_LOOP_INPUT;
  if (summaryOnlyInput) {
    const inputPath = path.resolve(process.cwd(), summaryOnlyInput);
    const summaryPath =
      process.env.AUDIT_LOOP_SUMMARY_OUT ?? defaultSummaryPath(inputPath);
    const rows = readJsonlRows(inputPath);
    const summary = buildAuditSummary(rows, inputPath);
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");
    console.log(`Wrote ${summaryPath}`);
    console.log(JSON.stringify(summary));
    return;
  }

  // Dynamic imports only — src/lib/atlas-ai.ts reads OPENROUTER_API_KEY at
  // module scope, so everything must load after loadEnvConfig().
  const [
    { prisma },
    { buildQuestionAnnotationBlock },
    { DIFF_DESCRIPTION, DIFFICULTY_RUBRIC, TYPE_LABELS },
    { buildAnalysisContext, extractTeacherAnnotations },
    { runQuestionGenerationWithEmptyRetry },
    { generateQuestionObject },
    { getDefaultQuestionTypeGenerationSettings },
    { getTypeQualityRubric },
    { STRUCTURED_TYPE_PROMPTS },
  ] = await Promise.all([
    import("../src/lib/prisma"),
    import("../src/lib/annotation-prompt"),
    import("../src/app/api/ai/generate-questions-auto/_lib/constants"),
    import("../src/app/api/ai/generate-questions-auto/_lib/build-analysis-context"),
    import("../src/app/api/ai/generate-questions-auto/_lib/run-question-generation"),
    import("../src/lib/question-generation-llm"),
    import("../src/lib/question-type-generation-settings"),
    import("../src/lib/question-quality"),
    import("../src/lib/question-schemas"),
  ]);

  const academyId = process.env.AUDIT_LOOP_ACADEMY_ID ?? DEFAULT_ACADEMY_ID;
  const runsPerCell = readIntEnv("AUDIT_LOOP_RUNS", 1);
  const maxRunsCap = readIntEnv("AUDIT_LOOP_MAX_RUNS", Number.MAX_SAFE_INTEGER);
  const passageLimit = readIntEnv("AUDIT_LOOP_PASSAGES", 10);
  const maxAttempts = readIntEnv("AUDIT_LOOP_ATTEMPTS", 2);
  const useLlmJudge = readBoolEnv("AUDIT_LOOP_LLM_JUDGE", true);
  const passScore = readIntEnv("AUDIT_LOOP_PASS_SCORE", DEFAULT_PASS_SCORE);
  const types = readListEnv<AuditType>("AUDIT_LOOP_TYPES", ALL_TYPES, ALL_TYPES);
  const generationPlans = readListEnv<GenerationPlan>(
    "AUDIT_LOOP_PLANS",
    ["STANDARD", "PREMIUM"],
    ["STANDARD", "PREMIUM"],
  );
  const difficulties = readListEnv<Difficulty>(
    "AUDIT_LOOP_DIFFICULTIES",
    ["BASIC", "INTERMEDIATE", "KILLER"],
    ["BASIC", "INTERMEDIATE", "KILLER"],
  );

  const defaultSettings = getDefaultQuestionTypeGenerationSettings();
  const settingsOverrides = readSettingsOverridesEnv("AUDIT_LOOP_SETTINGS_JSON");

  // READ-ONLY prod DB access — findMany only, no writes.
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
  if (passages.length === 0) {
    throw new Error(`No passages found for academyId=${academyId}`);
  }

  const outDir = path.join(process.cwd(), "artifacts", "ai-audits");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath =
    process.env.AUDIT_LOOP_OUT ??
    path.join(outDir, `question-quality-loop-${Date.now()}.jsonl`);
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  const summaryPath = defaultSummaryPath(outPath);
  const rows: AuditRow[] = [];
  let runIndex = 0;
  let creditsDepleted = false;

  // Serial execution only (rate limits) — type -> plan -> difficulty ->
  // passages[0..RUNS-1] so every cell gets coverage.
  outer: for (const type of types) {
    const config = TYPE_CONFIGS[type] ?? {};
    for (const generationPlan of generationPlans) {
      for (const difficulty of difficulties) {
        for (let cellRun = 0; cellRun < runsPerCell; cellRun += 1) {
          if (runIndex >= maxRunsCap) break outer;
          if (creditsDepleted) break outer;
          const passage = passages[cellRun % passages.length];
          runIndex += 1;
          const startedAt = Date.now();
          const usageEvents: unknown[] = [];
          const diffInstruction =
            DIFF_DESCRIPTION[difficulty] ?? DIFF_DESCRIPTION.INTERMEDIATE;
          const teacherIntentBlock = buildQuestionAnnotationBlock(
            extractTeacherAnnotations(passage),
          );
          const analysisContext = buildAnalysisContext(passage);
          const logPrefix = `Q-QUALITY:${runIndex}:${type}:${generationPlan}:${difficulty}`;
          const deadlineAt =
            Date.now() + (generationPlan === "PREMIUM" ? 360_000 : 180_000);
          // SUMMARY_WRITING/TOPIC_SENTENCE_WRITING must stay {} so difficulty
          // presets drive real differentiation (settings pin = preset shadow).
          const baseSettings = EMPTY_SETTINGS_TYPES.has(type)
            ? {}
            : (config.settings ??
              ((defaultSettings as Record<string, unknown>)[type] as
                | Record<string, unknown>
                | undefined) ??
              {});
          // Optional per-type override from AUDIT_LOOP_SETTINGS_JSON (additive
          // env). Merged over the base settings; unset env keeps prior behavior.
          const settingsOverride = settingsOverrides?.[type] ?? null;
          const effectiveSettings = settingsOverride
            ? { ...baseSettings, ...settingsOverride }
            : baseSettings;

          try {
            const result = await runQuestionGenerationWithEmptyRetry(
              {
                plan: [
                  {
                    subType: type,
                    count: 1,
                    reason: "Question quality loop",
                    targetPoints: [],
                  },
                ],
                schoolType:
                  passage.school?.type === "MIDDLE" ? "중학교" : "고등학교",
                gradeInfo: passage.grade ? `${passage.grade}학년` : "",
                passageContent: passage.content,
                teacherIntentBlock,
                analysisContext,
                diffLabel: difficulty,
                diffInstruction,
                generationPlan,
                typeSettings: {
                  [type]: {
                    ...effectiveSettings,
                    difficulty,
                    generationPlan,
                  },
                },
                onModelUsage: (event) => usageEvents.push(event),
              },
              {
                maxAttempts,
                logPrefix,
                deadlineAt,
              },
            );

            const question = (result.questions[0] ?? null) as
              | Record<string, unknown>
              | null;
            const localAuditFn = config.localAudit ?? auditLocalGenericQuestion;
            const localAudit = question
              ? localAuditFn({
                  question,
                  difficulty,
                  passage: passage.content,
                })
              : {
                  score: 0,
                  pass: false,
                  issues: [
                    {
                      severity: "critical" as const,
                      code: "no-question",
                      message: "Generation returned no question.",
                    },
                  ],
                };

            let llmJudge: z.infer<typeof LlmJudgeSchema> | null = null;
            let llmJudgeError: string | null = null;
            if (useLlmJudge && question) {
              // Cross-model judge: use the opposite plan's model family.
              const judgePlan: GenerationPlan =
                generationPlan === "PREMIUM" ? "STANDARD" : "PREMIUM";
              const qualityBar =
                getTypeQualityRubric(type, difficulty) ||
                (STRUCTURED_TYPE_PROMPTS[type]
                  ? `Type generation contract (excerpt):\n${STRUCTURED_TYPE_PROMPTS[type].slice(0, 1500)}`
                  : "");
              try {
                const judgeResult = await generateQuestionObject({
                  schema: LlmJudgeSchema,
                  generationPlan: judgePlan,
                  prompt: buildJudgePrompt({
                    type,
                    typeLabel: TYPE_LABELS[type] ?? type,
                    qualityBar,
                    difficultyRubric:
                      DIFFICULTY_RUBRIC[difficulty] ??
                      DIFFICULTY_RUBRIC.INTERMEDIATE ??
                      "",
                    judgeSchemaNote: config.judgeSchemaNote,
                    passage: passage.content,
                    question,
                    generationPlan,
                    difficulty,
                    localIssues: localAudit.issues,
                  }),
                  logPrefix: `${logPrefix}:JUDGE:${judgePlan}`,
                  maxTokens: 8192,
                  maxRetries: 1,
                  timeoutMs: judgePlan === "PREMIUM" ? 180_000 : 90_000,
                });
                llmJudge = judgeResult.object;
              } catch (error) {
                llmJudgeError =
                  error instanceof Error ? error.message : String(error);
                if (isCreditsDepletedError(llmJudgeError)) {
                  creditsDepleted = true;
                }
              }
            }

            const answerSurfaces = question
              ? (config.answerSurfaceExtractor ?? extractGenericAnswerSurfaces)(
                  question,
                )
              : [];
            const structuredData =
              question && isRecord(question.structuredData)
                ? question.structuredData
                : null;
            const notice = question
              ? text(question._generationNotice) ||
                text(structuredData?._generationNotice)
              : "";

            const pass =
              result.questions.length > 0 &&
              localAudit.pass &&
              !llmJudgeError &&
              (!llmJudge ||
                (llmJudge.verdict === "pass" && llmJudge.score >= passScore));

            const row: AuditRow = {
              runIndex,
              type,
              plan: generationPlan,
              difficulty,
              settingsOverride: settingsOverride ?? undefined,
              passageId: passage.id,
              title: passage.title,
              ok: pass,
              generated: result.questions.length > 0,
              elapsedMs: Date.now() - startedAt,
              attempts: result.attempts,
              relaxedFallback: result.relaxedFallback,
              rejectionSummary: result.rejectionSummary,
              localIssues: localAudit.issues,
              localScore: localAudit.score,
              llmScore: llmJudge?.score ?? null,
              llmFatal: llmJudge?.fatalIssues ?? [],
              llmMajor: llmJudge?.majorIssues ?? [],
              llmJudge,
              llmJudgeError,
              answerSurfaces,
              notice: notice || null,
              usageEvents,
              question,
            };
            rows.push(row);
            fs.appendFileSync(outPath, `${JSON.stringify(row)}\n`, "utf8");
            console.log(
              JSON.stringify({
                runIndex,
                ok: row.ok,
                type,
                plan: generationPlan,
                difficulty,
                generated: row.generated,
                elapsedMs: row.elapsedMs,
                localIssues: localAudit.issues.map((issue) => issue.code),
                llmScore: llmJudge?.score,
                llmFatal: llmJudge?.fatalIssues,
                llmMajor: llmJudge?.majorIssues,
                llmJudgeError,
              }),
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (isCreditsDepletedError(message)) {
              creditsDepleted = true;
            }
            const row: AuditRow = {
              runIndex,
              type,
              plan: generationPlan,
              difficulty,
              settingsOverride: settingsOverride ?? undefined,
              passageId: passage.id,
              title: passage.title,
              ok: false,
              generated: false,
              elapsedMs: Date.now() - startedAt,
              error: message,
              creditsDepleted: creditsDepleted || undefined,
              usageEvents,
            };
            rows.push(row);
            fs.appendFileSync(outPath, `${JSON.stringify(row)}\n`, "utf8");
            console.log(JSON.stringify(row));
          }
        }
      }
    }
  }

  const summary = buildAuditSummary(rows, outPath);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${summaryPath}`);
  if (creditsDepleted) {
    console.error(
      "ABORTED: credits depleted (402). Partial results and summary were written.",
    );
    process.exitCode = 2;
  }
  console.log(JSON.stringify(summary));

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
