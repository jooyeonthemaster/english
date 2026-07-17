import { readFileSync } from "node:fs";
import path from "node:path";

import { sha256V6, type JsonObject } from "./protocol-core";
import { observeDuplicateJsonKeysV6 } from "./strict-json-observer";

export const AUTHOR_BASELINE_LEDGER_RELATIVE_PATH_V6 =
  "experiments/question-quality-20260715/budget-ledger.json";
export const AUTHOR_BASELINE_LEDGER_SHA256_V6 =
  "9a05a64ed97c4746b7fe56933374d2179178885bd3e1db93f830f938bafdea1e";

export interface AuthorBaselineLedgerEvidenceV6 extends JsonObject {
  relativePath: typeof AUTHOR_BASELINE_LEDGER_RELATIVE_PATH_V6;
  fileSha256: typeof AUTHOR_BASELINE_LEDGER_SHA256_V6;
  schemaVersion: 1;
  capFullQuestionCandidates: 1000;
  usedFullQuestionCandidates: 0;
  reservedFullQuestionCandidates: 0;
  acceptedQuestions: 0;
  modelCalls: 0;
  inputTokens: 0;
  outputTokens: 0;
  costUsd: 0;
  batchCount: 0;
  readOnlyAttestations: 1;
  mutations: 0;
}

export function attestAuthorBaselineLedgerV6(repoRoot: string): AuthorBaselineLedgerEvidenceV6 {
  const absolute = path.resolve(repoRoot, AUTHOR_BASELINE_LEDGER_RELATIVE_PATH_V6);
  const relative = path.relative(repoRoot, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("author baseline ledger path escaped the repository");
  }
  const bytes = readFileSync(absolute);
  if (sha256V6(bytes) !== AUTHOR_BASELINE_LEDGER_SHA256_V6) {
    throw new Error("author baseline ledger bytes differ from the exact zero-activity starting SHA-256");
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (text.charCodeAt(0) === 0xfeff || observeDuplicateJsonKeysV6(text).length > 0) {
    throw new Error("author baseline ledger is BOM-prefixed or contains duplicate JSON keys");
  }
  const value = JSON.parse(text) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("author baseline ledger must be an object");
  }
  const ledger = value as JsonObject;
  const exactKeys = [
    "schemaVersion", "capFullQuestionCandidates", "usedFullQuestionCandidates",
    "reservedFullQuestionCandidates", "acceptedQuestions", "modelCalls", "inputTokens",
    "outputTokens", "costUsd", "startedAtKst", "lastUpdatedAtKst", "batches", "note",
  ].sort();
  if (JSON.stringify(Object.keys(ledger).sort()) !== JSON.stringify(exactKeys) ||
      ledger.schemaVersion !== 1 || ledger.capFullQuestionCandidates !== 1000 ||
      ledger.usedFullQuestionCandidates !== 0 || ledger.reservedFullQuestionCandidates !== 0 ||
      ledger.acceptedQuestions !== 0 || ledger.modelCalls !== 0 || ledger.inputTokens !== 0 ||
      ledger.outputTokens !== 0 || ledger.costUsd !== 0 ||
      ledger.startedAtKst !== "2026-07-15T01:00:00+09:00" ||
      ledger.lastUpdatedAtKst !== "2026-07-15T01:00:00+09:00" ||
      !Array.isArray(ledger.batches) || ledger.batches.length !== 0 ||
      typeof ledger.note !== "string" || !ledger.note) {
    throw new Error("author baseline ledger exact schema or zero-activity invariants differ");
  }
  return {
    relativePath: AUTHOR_BASELINE_LEDGER_RELATIVE_PATH_V6,
    fileSha256: AUTHOR_BASELINE_LEDGER_SHA256_V6,
    schemaVersion: 1,
    capFullQuestionCandidates: 1000,
    usedFullQuestionCandidates: 0,
    reservedFullQuestionCandidates: 0,
    acceptedQuestions: 0,
    modelCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    batchCount: 0,
    readOnlyAttestations: 1,
    mutations: 0,
  };
}
