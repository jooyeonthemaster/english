import type {
  QuestionAnalysis,
  QuestionInventoryItem,
  SingleItemAnalysis,
} from "./schema";
import { flattenAnalysisQuestions } from "./analysis-shape";

const SHORT_ANSWER_LABEL_RE = /(?:\[?\s*)?\uc11c\ub2f5\ud615\s*([0-9]{1,3})(?:\s*\])?/u;

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function numericKey(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return `q:${Math.trunc(value)}`;
  return null;
}

function shortAnswerKey(value: unknown): string | null {
  const text = clean(value);
  const match = text.match(SHORT_ANSWER_LABEL_RE);
  return match ? `sa:${match[1]}` : null;
}

function labelKey(value: unknown): string | null {
  const text = clean(value);
  if (!text) return null;
  const shortAnswer = shortAnswerKey(text);
  if (shortAnswer) return shortAnswer;

  const numeric = text.match(/^#?\s*([0-9]{1,3})(?:\s*[.)]|\s*\ubc88)?\s*$/u);
  if (numeric) return `q:${numeric[1]}`;

  return `label:${text
    .toLowerCase()
    .replace(/[\s[\](){}._:-]+/g, "")}`;
}

function markerKeysForInventoryItem(item: QuestionInventoryItem): string[] {
  return [
    numericKey(item.questionNumber),
    labelKey(item.label),
    shortAnswerKey(item.direction),
  ].filter((key): key is string => Boolean(key));
}

function markerKeysForQuestion(question: QuestionAnalysis): string[] {
  return [
    numericKey(question.source.questionNumber),
    shortAnswerKey(question.source.direction),
    labelKey(question.source.direction.match(/^\s*(?:\[?[^\]\n]{1,20}\]?)/u)?.[0]),
  ].filter((key): key is string => Boolean(key));
}

function isRecoverableInventoryItem(item: QuestionInventoryItem): boolean {
  if (item.status !== "complete") return false;
  return markerKeysForInventoryItem(item).length > 0;
}

export function findMissingInventoryItems(args: {
  inventory: QuestionInventoryItem[] | undefined;
  analysis: SingleItemAnalysis;
}): QuestionInventoryItem[] {
  const existingKeys = new Set<string>();
  for (const located of flattenAnalysisQuestions(args.analysis)) {
    for (const key of markerKeysForQuestion(located.question)) existingKeys.add(key);
  }

  const missing: QuestionInventoryItem[] = [];
  const queuedKeys = new Set<string>();
  for (const item of args.inventory ?? []) {
    if (!isRecoverableInventoryItem(item)) continue;
    const keys = markerKeysForInventoryItem(item);
    if (keys.some((key) => existingKeys.has(key) || queuedKeys.has(key))) continue;
    for (const key of keys) queuedKeys.add(key);
    missing.push(item);
  }
  return missing;
}

export function summarizeInventoryItem(item: QuestionInventoryItem): string {
  const marker =
    typeof item.questionNumber === "number"
      ? String(item.questionNumber)
      : clean(item.label) || "?";
  const direction = clean(item.direction).slice(0, 80);
  return `q=${marker} status=${item.status} direction=${direction}`;
}
