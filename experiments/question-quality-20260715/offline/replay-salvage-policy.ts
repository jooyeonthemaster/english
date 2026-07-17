import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SALVAGE_RELAXABLE_CODES } from "../../../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants";

type JsonRecord = Record<string, unknown>;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../..");
const DEFAULT_INPUT = path.join(REPO_ROOT, "experiments/grammar-quality-20260714");
const DEFAULT_OUTPUT = path.join(HERE, "salvage-policy-replay.json");

// These are proposed correctness/explanation invariants for offline replay,
// not an automatic production policy. They intentionally err on the side of
// requiring repair or human adjudication instead of silently shipping.
const PROPOSED_HARD_INVARIANTS = new Set([
  "combo-explanation-truncated",
  "grammar-answer-nonword-forced",
  "grammar-appear-pointcode-voice-mismatch",
  "grammar-category-mislabel",
  "grammar-error-pos-change",
  "grammar-gibberish-inversion-fragment",
  "grammar-human-made-postmodifier-mislabel",
  "grammar-look-like-complement-mislabel",
  "grammar-noun-clause-pronoun-mislabel",
  "grammar-appear-adverb-mislabel",
  "grammar-afford-modal-mislabel",
  "grammar-phrasal-verb-mislabel",
  "grammar-pointcode-span-mismatch",
  "grammar-seem-to-complement-mislabel",
  "grammar-seem-to-object-mislabel",
  "grammar-that-way-adverb-mislabel",
  "wrong-option-explanation-count",
]);

const PROPOSED_SPLIT_OR_REPAIR_REQUIRED = new Set([
  "blank-awkward-correct-option",
  "blank-paraphrase-subject-slot-mismatch",
  "grammar-correction-form-exposed",
  "grammar-error-explanation-surface-order",
  "grammar-explanation-lint",
  "grammar-explanation-typo",
]);

interface Args {
  input: string;
  output: string;
  write: boolean;
}

function parseArgs(argv: string[]): Args {
  const result: Args = { input: DEFAULT_INPUT, output: DEFAULT_OUTPUT, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") result.input = path.resolve(argv[++index] ?? "");
    else if (arg.startsWith("--input=")) result.input = path.resolve(arg.slice(8));
    else if (arg === "--output") result.output = path.resolve(argv[++index] ?? "");
    else if (arg.startsWith("--output=")) result.output = path.resolve(arg.slice(9));
    else if (arg === "--write") result.write = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function listResults(root: string): string[] {
  const output: string[] = [];
  const visit = (entry: string) => {
    if (!fs.existsSync(entry)) return;
    const stats = fs.statSync(entry);
    if (stats.isDirectory()) {
      for (const child of fs.readdirSync(entry).sort()) visit(path.join(entry, child));
    } else if (/results[^/\\]*\.jsonl$/i.test(entry)) output.push(entry);
  };
  visit(root);
  return output;
}

function normalizeCode(raw: string): string | undefined {
  const candidate = raw
    .trim()
    .replace(/^\[[^\]]+\]\s*/, "")
    .split(/[×x]\d+\s*$/i)[0]
    .split(/[:：\s]/)[0];
  return /^[a-z][a-z0-9-]+$/.test(candidate) ? candidate : undefined;
}

function collectCodes(value: unknown, output = new Set<string>(), seen = new Set<object>()): Set<string> {
  if (typeof value === "string") {
    const code = normalizeCode(value);
    if (code) output.add(code);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  if (seen.has(value as object)) return output;
  seen.add(value as object);
  if (Array.isArray(value)) {
    value.forEach((child) => collectCodes(child, output, seen));
    return output;
  }
  const record = value as JsonRecord;
  if (typeof record.code === "string") {
    const code = normalizeCode(record.code);
    if (code) output.add(code);
  }
  for (const key of [
    "errors",
    "warnings",
    "_qualityWarnings",
    "qualityWarnings",
  ]) {
    if (key in record) collectCodes(record[key], output, seen);
  }
  if (isRecord(record.question)) collectCodes(record.question, output, seen);
  return output;
}

function countBy(rows: Array<{ codes: string[] }>, filter?: (code: string) => boolean): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const code of row.codes) {
      if (filter && !filter(code)) continue;
      counts[code] = (counts[code] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function questionFingerprint(row: JsonRecord, file: string, line: number): string {
  const question = isRecord(row.question) ? row.question : undefined;
  const material = question
    ? {
        passage: question.passageWithMarkers ?? question.passageWithBlank ?? question.passage,
        options: question.options,
        markedExpressions: question.markedExpressions,
        correctAnswer: question.correctAnswer,
        correctAnswers: question.correctAnswers,
        explanation: question.explanation,
      }
    : { file, line };
  return crypto.createHash("sha256").update(JSON.stringify(material), "utf8").digest("hex");
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const files = listResults(args.input);
  const rows: Array<{
    file: string;
    line: number;
    questionHash: string;
    passageId: string | null;
    ok: boolean;
    attempts: number | null;
    qualityMode: string | null;
    codes: string[];
    salvageCodes: string[];
    hardInvariantCodes: string[];
    splitOrRepairCodes: string[];
  }> = [];
  const parseErrors: Array<{ file: string; line: number; message: string }> = [];
  for (const file of files) {
    fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .forEach((line, lineIndex) => {
        if (!line.trim()) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(line) as unknown;
        } catch (error) {
          parseErrors.push({
            file: path.relative(REPO_ROOT, file).replaceAll("\\", "/"),
            line: lineIndex + 1,
            message: error instanceof Error ? error.message : String(error),
          });
          return;
        }
        if (!isRecord(parsed)) return;
        const codes = [...collectCodes(parsed)].sort();
        const salvageCodes = codes.filter((code) => SALVAGE_RELAXABLE_CODES.has(code));
        if (salvageCodes.length === 0) return;
        rows.push({
          file: path.relative(REPO_ROOT, file).replaceAll("\\", "/"),
          line: lineIndex + 1,
          questionHash: questionFingerprint(parsed, file, lineIndex + 1),
          passageId: typeof parsed.passageId === "string" ? parsed.passageId : null,
          ok: parsed.ok === true,
          attempts: typeof parsed.attempts === "number" ? parsed.attempts : null,
          qualityMode:
            typeof parsed.qualityMode === "string"
              ? parsed.qualityMode
              : isRecord(parsed.question) && typeof parsed.question._qualityMode === "string"
                ? parsed.question._qualityMode
                : null,
          codes,
          salvageCodes,
          hardInvariantCodes: salvageCodes.filter((code) => PROPOSED_HARD_INVARIANTS.has(code)),
          splitOrRepairCodes: salvageCodes.filter((code) => PROPOSED_SPLIT_OR_REPAIR_REQUIRED.has(code)),
        });
      });
  }
  const okRows = rows.filter((row) => row.ok);
  const hardRows = okRows.filter((row) => row.hardInvariantCodes.length > 0);
  const repairRows = okRows.filter((row) => row.splitOrRepairCodes.length > 0);
  const uniqueByQuestion = <T extends { questionHash: string }>(values: T[]): T[] =>
    [...new Map(values.map((row) => [row.questionHash, row])).values()];
  const uniqueOkRows = uniqueByQuestion(okRows);
  const uniqueHardRows = uniqueByQuestion(hardRows);
  const uniqueRepairRows = uniqueByQuestion(repairRows);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: "offline-historical-descriptive",
    caveat:
      "Historical artifact codes were produced by different commits and are not causal estimates. Proposed classes require item-level adjudication before changing production policy.",
    filesScanned: files.length,
    parseErrors,
    rowsWithAnyCurrentSalvageCode: rows.length,
    okRowsWithAnyCurrentSalvageCode: okRows.length,
    okRowsWithProposedHardInvariant: hardRows.length,
    okRowsWithSplitOrRepairRequired: repairRows.length,
    uniqueOkQuestionsWithAnyCurrentSalvageCode: uniqueOkRows.length,
    uniqueOkQuestionsWithProposedHardInvariant: uniqueHardRows.length,
    uniqueOkQuestionsWithSplitOrRepairRequired: uniqueRepairRows.length,
    currentSalvageCodeFrequency: countBy(okRows, (code) => SALVAGE_RELAXABLE_CODES.has(code)),
    proposedHardInvariantFrequency: countBy(hardRows, (code) => PROPOSED_HARD_INVARIANTS.has(code)),
    proposedSplitOrRepairFrequency: countBy(repairRows, (code) =>
      PROPOSED_SPLIT_OR_REPAIR_REQUIRED.has(code),
    ),
    currentSalvageCodeCount: SALVAGE_RELAXABLE_CODES.size,
    proposedHardInvariants: [...PROPOSED_HARD_INVARIANTS].sort(),
    proposedSplitOrRepairRequired: [...PROPOSED_SPLIT_OR_REPAIR_REQUIRED].sort(),
    affectedRows: [...new Map([...hardRows, ...repairRows].map((row) => [`${row.file}:${row.line}`, row])).values()],
  };
  if (args.write) {
    fs.mkdirSync(path.dirname(args.output), { recursive: true });
    fs.writeFileSync(args.output, stableJson(report), "utf8");
  }
  process.stdout.write(
    stableJson({
      mode: args.write ? "write" : "dry-run",
      filesScanned: report.filesScanned,
      parseErrorCount: parseErrors.length,
      rowsWithAnyCurrentSalvageCode: report.rowsWithAnyCurrentSalvageCode,
      okRowsWithAnyCurrentSalvageCode: report.okRowsWithAnyCurrentSalvageCode,
      okRowsWithProposedHardInvariant: report.okRowsWithProposedHardInvariant,
      okRowsWithSplitOrRepairRequired: report.okRowsWithSplitOrRepairRequired,
      uniqueOkQuestionsWithAnyCurrentSalvageCode: report.uniqueOkQuestionsWithAnyCurrentSalvageCode,
      uniqueOkQuestionsWithProposedHardInvariant: report.uniqueOkQuestionsWithProposedHardInvariant,
      uniqueOkQuestionsWithSplitOrRepairRequired: report.uniqueOkQuestionsWithSplitOrRepairRequired,
    }),
  );
}

main();
