// generate-exam-passage-webtoons.ts 의 순수 헬퍼 — CLI 인자 파싱·정렬·해시·메타.
// DB·네트워크·스토리지를 건드리지 않는다. 500줄 규칙으로 본체에서 그대로 옮겨 왔다(동작 불변).
import { createHash } from "node:crypto";
import type { ExamPassage } from "../src/lib/exam-passages/types";
import type { WebtoonImagePlanId } from "../src/lib/webtoon-models";
import type { WebtoonLanguageId } from "../src/app/(director)/director/workbench/webtoon/webtoon-page-types";

export interface ExamWebtoonScriptArgs {
  execute: boolean;
  force: boolean;
  reviewOnly: boolean;
  noAutoApprove: boolean;
  limit: number | null;
  offset: number;
  yearFrom: number | null;
  passageId: string | null;
  language: WebtoonLanguageId | null;
  plan: WebtoonImagePlanId;
  maxReviewAttempts: number;
  imageTimeoutMs: number;
}

export function sourceMeta(passage: ExamPassage) {
  return {
    year: passage.year,
    exam: passage.exam,
    grade: passage.grade ?? "고",
    qNumbers: passage.qNumbers,
    type: passage.type,
    typeGroup: passage.typeGroup,
    reconstructionKind: passage.reconstructionKind,
    confidence: passage.confidence,
    wordCount: passage.wordCount,
  };
}

export function compareLatestFirst(a: ExamPassage, b: ExamPassage): number {
  if (b.year !== a.year) return b.year - a.year;
  const examOrder = examRank(b.exam) - examRank(a.exam);
  if (examOrder !== 0) return examOrder;
  const aQuestion = a.qNumbers?.[0] ?? 0;
  const bQuestion = b.qNumbers?.[0] ?? 0;
  if (aQuestion !== bQuestion) return aQuestion - bQuestion;
  return a.id.localeCompare(b.id);
}

function examRank(value: string): number {
  if (/11|nov|11월/i.test(value)) return 5;
  if (/9|sep|9월/i.test(value)) return 4;
  if (/6|jun|6월/i.test(value)) return 3;
  if (/수능|csat/i.test(value)) return 2;
  return 1;
}

export function hashPrompt(prompt: string) {
  return createHash("sha256").update(prompt, "utf8").digest("hex");
}

export function parseArgs(argv: string[]): ExamWebtoonScriptArgs {
  const valueOf = (name: string) => {
    const found = argv.find((arg) => arg.startsWith(`${name}=`));
    return found ? found.slice(name.length + 1) : null;
  };
  const language = valueOf("--language");
  const planArg = valueOf("--plan");
  const limit = parsePositiveInt(valueOf("--limit"));
  const offset = parseNonNegativeInt(valueOf("--offset")) ?? 0;
  const yearFrom = parsePositiveInt(valueOf("--year-from"));
  const passageId = valueOf("--passage-id")?.trim() || null;
  const maxReviewAttempts = parsePositiveInt(valueOf("--max-review-attempts")) ?? 3;
  const imageTimeoutMs = parsePositiveInt(valueOf("--image-timeout-ms")) ?? 900_000;
  return {
    execute: argv.includes("--execute"),
    force: argv.includes("--force"),
    reviewOnly: argv.includes("--review-only"),
    noAutoApprove: argv.includes("--no-auto-approve"),
    limit,
    offset,
    yearFrom,
    passageId,
    language: isLanguage(language) ? language : null,
    plan: planArg === "STANDARD" || planArg === "PREMIUM" ? planArg : "PREMIUM",
    maxReviewAttempts: Math.max(1, Math.min(8, maxReviewAttempts)),
    imageTimeoutMs: Math.max(60_000, Math.min(1_800_000, imageTimeoutMs)),
  };
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isLanguage(value: string | null): value is WebtoonLanguageId {
  return (
    value === "KO" ||
    value === "KO_EN" ||
    value === "EN" ||
    value === "EN_KO_GLOSS"
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
