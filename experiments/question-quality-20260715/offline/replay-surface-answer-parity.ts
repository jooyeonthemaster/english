import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizePaperFields, normalizeStructuredQuestionForDisplay } from "../../../src/components/exams/paper-builder/render-model";
import { grammarMarkerIndex } from "../../../src/components/exams/paper-builder/option-display";
import { buildAnswerSpec } from "../../../src/lib/exam-scoring/answer-spec";
import { buildStudentSafeQuestion } from "../../../src/lib/exam-scoring/student-safe";

type JsonRecord = Record<string, unknown>;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_INPUT = path.resolve(HERE, "../baseline/jul15-dawn/private/manifest-private.json");
const DEFAULT_OUTPUT = path.join(HERE, "surface-answer-parity-report.json");
const MARKED_TYPES = new Set(["GRAMMAR_ERROR", "VOCAB_CHOICE", "ANTONYM"]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readStructured(value: unknown): JsonRecord | null {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeAnswer(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(normalizeAnswer);
  if (typeof value !== "string" && typeof value !== "number") return [];
  const text = String(value).trim();
  if (!text) return [];
  const tokens = text.split(/[,\s]+/).filter(Boolean);
  return tokens.flatMap((token) => {
    const index = grammarMarkerIndex(token);
    if (index !== null) return [String(index + 1)];
    const number = token.match(/\d+/)?.[0];
    return number ? [String(Number(number))] : [];
  });
}

function specAnswers(spec: ReturnType<typeof buildAnswerSpec>): string[] {
  return "correctChoices" in spec && Array.isArray(spec.correctChoices)
    ? spec.correctChoices.map(String)
    : [];
}

function semanticAnswerFromMarkers(type: string, structured: JsonRecord): string[] {
  const items = Array.isArray(structured.markedExpressions)
    ? structured.markedExpressions
    : Array.isArray(structured.markedWords)
      ? structured.markedWords
      : [];
  return items.flatMap((item) => {
    if (!isRecord(item)) return [];
    const isAnswer =
      type === "GRAMMAR_ERROR"
        ? item.isError === true
        : type === "VOCAB_CHOICE"
          ? item.isInappropriate === true
          : item.isIncorrectPair === true;
    return isAnswer ? normalizeAnswer(item.label) : [];
  });
}

function equalAnswers(left: string[], right: string[]): boolean {
  return [...left].sort().join(",") === [...right].sort().join(",");
}

function main(): void {
  const write = process.argv.includes("--write");
  const inputArg = process.argv.find((arg) => arg.startsWith("--input="));
  const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
  const input = inputArg ? path.resolve(inputArg.slice("--input=".length)) : DEFAULT_INPUT;
  const output = outputArg ? path.resolve(outputArg.slice("--output=".length)) : DEFAULT_OUTPUT;
  const manifest = JSON.parse(fs.readFileSync(input, "utf8")) as unknown;
  if (!Array.isArray(manifest)) throw new Error("Expected a manifest array");

  const records = manifest.flatMap((entry): JsonRecord[] => {
    if (!isRecord(entry) || !isRecord(entry.question)) return [];
    const question = entry.question;
    const type = typeof question.subType === "string" ? question.subType : "";
    if (!MARKED_TYPES.has(type)) return [];
    const structured = readStructured(question.structuredData);
    if (!structured) return [];

    const rawSpec = buildAnswerSpec({
      id: typeof question.id === "string" ? question.id : String(entry.blindId ?? "unknown"),
      type: typeof question.type === "string" ? question.type : "",
      subType: type,
      options: question.options,
      correctAnswer: typeof question.correctAnswer === "string" ? question.correctAnswer : null,
      structuredData: structured,
      points: typeof question.points === "number" ? question.points : 1,
    });
    const normalized = normalizeStructuredQuestionForDisplay(structured);
    const normalizedRecord = isRecord(normalized) ? normalized : structured;
    const paper = normalizePaperFields({
      ...question,
      structuredData: structured,
      passage: null,
    } as never);
    const safe = buildStudentSafeQuestion({
      id: typeof question.id === "string" ? question.id : String(entry.blindId ?? "unknown"),
      subType: type,
      questionText: typeof question.questionText === "string" ? question.questionText : "",
      questionImage: typeof question.questionImage === "string" ? question.questionImage : null,
      options: question.options,
      structuredData: structured,
      correctAnswer: typeof question.correctAnswer === "string" ? question.correctAnswer : null,
      passage: null,
    });

    const rawStored = normalizeAnswer(structured.correctAnswers ?? structured.correctAnswer ?? question.correctAnswer);
    const rawScoring = specAnswers(rawSpec);
    const tabletVisibleSemantic = semanticAnswerFromMarkers(type, normalizedRecord);
    const workbench = normalizeAnswer(normalizedRecord.correctAnswers ?? normalizedRecord.correctAnswer);
    const paperAnswer = normalizeAnswer(paper?.correctAnswer);
    const tabletPassage = safe.safeData?.passageWithMarkers ?? null;
    const mismatch =
      !equalAnswers(rawScoring, tabletVisibleSemantic.length > 0 ? tabletVisibleSemantic : rawStored) ||
      (workbench.length > 0 && !equalAnswers(rawScoring, workbench)) ||
      (paperAnswer.length > 0 && !equalAnswers(rawScoring, paperAnswer));

    return [
      {
        blindId: entry.blindId ?? null,
        questionId: question.id ?? null,
        type,
        rawStoredAnswer: rawStored,
        rawScoringAnswer: rawScoring,
        tabletVisibleSemanticAnswer: tabletVisibleSemantic,
        workbenchNormalizedAnswer: workbench,
        paperNormalizedAnswer: paperAnswer,
        tabletPassageMarkerSequence:
          typeof tabletPassage === "string"
            ? [...tabletPassage.matchAll(/__\s*\(?([A-Ja-j])\)?\s+[^_]+__/g)].map((match) =>
                String((match[1].toUpperCase().charCodeAt(0) - 65) + 1),
              )
            : [],
        rawScoringMatchesTabletSemantic: equalAnswers(
          rawScoring,
          tabletVisibleSemantic.length > 0 ? tabletVisibleSemantic : rawStored,
        ),
        rawScoringMatchesWorkbench: workbench.length === 0 || equalAnswers(rawScoring, workbench),
        rawScoringMatchesPaper: paperAnswer.length === 0 || equalAnswers(rawScoring, paperAnswer),
        crossSurfaceMismatch: mismatch,
      },
    ];
  });

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    input: path.relative(path.resolve(HERE, "../../.."), input).replaceAll("\\", "/"),
    markedQuestionCount: records.length,
    mismatchCount: records.filter((record) => record.crossSurfaceMismatch === true).length,
    caveat:
      "This is a pure-function surface replay. A browser E2E is still required to prove the exact deployed student and paper pixels.",
    records,
  };
  if (write) fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: write ? "write" : "dry-run",
        markedQuestionCount: report.markedQuestionCount,
        mismatchCount: report.mismatchCount,
        mismatches: records.filter((record) => record.crossSurfaceMismatch === true),
      },
      null,
      2,
    )}\n`,
  );
}

main();
