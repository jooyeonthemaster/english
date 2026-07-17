import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  analyzeBlankSeam,
  type BlankSeamOption as BlankOption,
} from "../../../src/lib/question-quality/validators/blank/seam";

type JsonRecord = Record<string, unknown>;

interface ExtractedQuestion {
  sourceFile: string;
  sourceLocator: string;
  questionId: string | null;
  type: string | null;
  passageWithBlank: string;
  options: BlankOption[];
  correctAnswer?: string;
}

interface CliOptions {
  inputs: string[];
  output: string;
  write: boolean;
  help: boolean;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../..");
const DEFAULT_INPUTS = [
  "scripts/_gen_audit_out",
  "artifacts/ai-audits",
  "experiments/grammar-quality-20260714/e2e-types/BLANK_INFERENCE",
  "experiments/question-quality-20260715/baseline/jul15-dawn/private/manifest-private.json",
];

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputs: [],
    output: path.join(HERE, "blank-seam-report.json"),
    write: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") options.inputs.push(argv[++index] ?? "");
    else if (arg.startsWith("--input=")) options.inputs.push(arg.slice("--input=".length));
    else if (arg === "--output") options.output = argv[++index] ?? "";
    else if (arg.startsWith("--output=")) options.output = arg.slice("--output=".length);
    else if (arg === "--write") options.write = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.inputs.length === 0) options.inputs = DEFAULT_INPUTS;
  if (!options.output) throw new Error("--output must not be empty");
  return options;
}

function help(): string {
  return [
    "Offline blank-boundary replay (no model/API calls)",
    "",
    "Usage:",
    "  npx tsx experiments/question-quality-20260715/offline/replay-blank-seams.ts [options]",
    "",
    "Options:",
    "  --input <file-or-dir>  Repeatable. Defaults to historical question artifacts.",
    "  --output <file>        Report path.",
    "  --write                Persist the report; otherwise print summary only.",
  ].join("\n");
}

function absolute(input: string): string {
  return path.isAbsolute(input) ? path.resolve(input) : path.resolve(REPO_ROOT, input);
}

function listFiles(inputPaths: string[]): string[] {
  const files: string[] = [];
  const visit = (entry: string) => {
    if (!fs.existsSync(entry)) return;
    const stats = fs.statSync(entry);
    if (stats.isDirectory()) {
      for (const child of fs.readdirSync(entry).sort()) visit(path.join(entry, child));
      return;
    }
    if (/\.(?:json|jsonl)$/i.test(entry)) files.push(path.resolve(entry));
  };
  for (const input of inputPaths.map(absolute)) visit(input);
  return [...new Set(files)].sort();
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonMaybe(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function optionsFrom(value: unknown): BlankOption[] {
  const parsed = parseJsonMaybe(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item, index): BlankOption[] => {
    if (typeof item === "string" && item.trim()) {
      return [{ label: String(index + 1), text: item.trim() }];
    }
    if (!isRecord(item)) return [];
    const text = [item.text, item.content, item.value].find(
      (candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0,
    );
    if (!text) return [];
    const rawLabel = [item.label, item.id, item.key].find(
      (candidate): candidate is string | number =>
        typeof candidate === "string" || typeof candidate === "number",
    );
    return [{ label: rawLabel === undefined ? String(index + 1) : String(rawLabel), text: text.trim() }];
  });
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function questionFromRecord(
  record: JsonRecord,
  sourceFile: string,
  locator: string,
): ExtractedQuestion | undefined {
  const structured = isRecord(record.structuredData) ? record.structuredData : record;
  const passageWithBlank = firstString(
    structured.passageWithBlank,
    structured.blankedPassage,
    structured.blankPassage,
  );
  if (!passageWithBlank || !/(?:_{3,}|\[\s*(?:blank|빈칸)\s*\]|<\s*(?:blank|빈칸)\s*>)/i.test(passageWithBlank)) {
    return undefined;
  }
  const options = optionsFrom(structured.options ?? record.options);
  if (options.length < 2) return undefined;
  const type = firstString(
    structured._typeId,
    structured.type,
    record.subType,
    record.questionType,
    record.type,
  );
  return {
    sourceFile: path.relative(REPO_ROOT, sourceFile).replaceAll("\\", "/"),
    sourceLocator: locator,
    questionId: firstString(record.id, structured.id, record.questionId) ?? null,
    type: type ?? null,
    passageWithBlank,
    options,
    correctAnswer: firstString(structured.correctAnswer, record.correctAnswer),
  };
}

function extractQuestions(value: unknown, sourceFile: string): ExtractedQuestion[] {
  const questions: ExtractedQuestion[] = [];
  const seenObjects = new Set<object>();
  const visit = (node: unknown, locator: string) => {
    if (!node || typeof node !== "object") return;
    if (seenObjects.has(node as object)) return;
    seenObjects.add(node as object);
    if (Array.isArray(node)) {
      node.forEach((child, index) => visit(child, `${locator}[${index}]`));
      return;
    }
    const record = node as JsonRecord;
    const question = questionFromRecord(record, sourceFile, locator);
    if (question) questions.push(question);
    for (const [key, child] of Object.entries(record)) {
      // A matched wrapper already consumed structuredData. Traversing it again
      // would duplicate the same question with a different locator.
      if (question && key === "structuredData") continue;
      if (child && typeof child === "object") visit(child, `${locator}.${key}`);
    }
  };
  visit(value, "$");
  return questions;
}

function readFileQuestions(filePath: string): { questions: ExtractedQuestion[]; parseErrors: string[] } {
  const raw = fs.readFileSync(filePath, "utf8");
  const parseErrors: string[] = [];
  if (/\.jsonl$/i.test(filePath)) {
    const questions: ExtractedQuestion[] = [];
    raw.split(/\r?\n/).forEach((line, index) => {
      if (!line.trim()) return;
      try {
        questions.push(...extractQuestions(JSON.parse(line) as unknown, filePath));
      } catch (error) {
        parseErrors.push(`line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    return { questions, parseErrors };
  }
  try {
    return { questions: extractQuestions(JSON.parse(raw) as unknown, filePath), parseErrors };
  } catch (error) {
    parseErrors.push(error instanceof Error ? error.message : String(error));
    return { questions: [], parseErrors };
  }
}

function fingerprint(question: ExtractedQuestion): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        passageWithBlank: question.passageWithBlank.replace(/\s+/g, " ").trim(),
        options: question.options.map((option) => ({ label: option.label, text: option.text })),
      }),
      "utf8",
    )
    .digest("hex");
}

function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${help()}\n`);
    return;
  }
  const files = listFiles(options.inputs);
  const parseErrors: Array<{ file: string; errors: string[] }> = [];
  const extracted: ExtractedQuestion[] = [];
  for (const file of files) {
    const result = readFileQuestions(file);
    extracted.push(...result.questions);
    if (result.parseErrors.length > 0) {
      parseErrors.push({ file: path.relative(REPO_ROOT, file).replaceAll("\\", "/"), errors: result.parseErrors });
    }
  }
  const unique = new Map<string, ExtractedQuestion>();
  for (const question of extracted) unique.set(fingerprint(question), question);
  const records = [...unique.entries()].flatMap(([questionHash, question]) => {
    const findings = analyzeBlankSeam(question);
    if (findings.length === 0) return [];
    return [
      {
        questionHash,
        sourceFile: question.sourceFile,
        sourceLocator: question.sourceLocator,
        questionId: question.questionId,
        type: question.type,
        correctAnswer: question.correctAnswer ?? null,
        optionCount: question.options.length,
        options: question.options,
        findings,
        manualDisposition: "PENDING",
      },
    ];
  });
  const findingCounts: Record<string, number> = {};
  for (const record of records) {
    for (const finding of record.findings) {
      findingCounts[finding.code] = (findingCounts[finding.code] ?? 0) + 1;
    }
  }
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: "offline-deterministic-replay",
    caveat:
      "Findings are high-recall boundary risks, not final grammar verdicts. Every hit requires blinded human adjudication before a production block is enabled.",
    inputs: options.inputs,
    filesScanned: files.length,
    extractedQuestionOccurrences: extracted.length,
    uniqueBlankQuestions: unique.size,
    triggeredQuestions: records.length,
    findingCounts,
    parseErrorFileCount: parseErrors.length,
    parseErrors,
    records,
  };
  if (options.write) {
    const output = absolute(options.output);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, stableStringify(report), "utf8");
  }
  process.stdout.write(
    stableStringify({
      mode: options.write ? "write" : "dry-run",
      output: options.write ? path.relative(REPO_ROOT, absolute(options.output)).replaceAll("\\", "/") : null,
      filesScanned: report.filesScanned,
      uniqueBlankQuestions: report.uniqueBlankQuestions,
      triggeredQuestions: report.triggeredQuestions,
      findingCounts,
      parseErrorFileCount: report.parseErrorFileCount,
    }),
  );
}

main();
