import { createHash } from "node:crypto";

import type {
  AtlasProductionWireRequestFacts,
  QuestionGenerationAssignmentBudgetMode,
} from "@/lib/atlas-production-assignment-fetch-boundary";

const ACTIVE_MODES = new Set<QuestionGenerationAssignmentBudgetMode>([
  "AUDIT",
  "SHADOW",
  "CANARY_ENFORCE",
  "ENFORCE",
]);
export const QUESTION_GENERATION_ASSIGNMENT_PRICE_MAX_AGE_MS =
  15 * 60 * 1_000;
const MICROS_PER_DOLLAR = BigInt(1_000_000);

export interface QuestionGenerationAssignmentDescriptor {
  jobId: string;
  route: "FAST" | "TRIGGER";
  generationPlan: "STANDARD" | "PREMIUM";
  questionType: string;
  difficulty: string;
}

export interface AssignmentBudgetRate {
  inputUsdMicrosPerMillionTokens: bigint;
  outputUsdMicrosPerMillionTokens: bigint;
  fixedUsdMicrosPerRequest: bigint;
  fixedInputTokenOverhead: bigint;
}

export interface AssignmentBudgetPriceSnapshot {
  id: string;
  hash: string;
  capturedAt: Date;
  expiresAt: Date;
  endpointOrigin: string;
  endpointPath: string;
  providerRoutingHash: string;
  routingPriceCoverage: "PINNED_PROVIDER_SET_MAX" | "ALL_ROUTER_UPSTREAMS_MAX";
  rates: Readonly<Record<string, Readonly<AssignmentBudgetRate>>>;
}

export interface ActiveQuestionGenerationAssignmentBudgetPolicy {
  mode: QuestionGenerationAssignmentBudgetMode;
  policyVersion: string;
  policyHash: string;
  descriptorHash: string;
  maxPhysicalCalls: number | null;
  maxReservedCostMicros: bigint | null;
  perCallMaxReservedCostMicros: bigint | null;
  maxRequestBodyUtf8Bytes: number | null;
  maxCompletionCount: number | null;
  priceSnapshot: Readonly<AssignmentBudgetPriceSnapshot> | null;
  configurationWarning: string | null;
}

export type QuestionGenerationAssignmentBudgetAdmission =
  | { mode: "OFF" }
  | ActiveQuestionGenerationAssignmentBudgetPolicy;

export class QuestionGenerationAssignmentBudgetPolicyError extends Error {
  readonly code: string;
  readonly retryable = false;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "QuestionGenerationAssignmentBudgetPolicyError";
    this.code = code;
  }
}

function policyError(code: string, message: string): never {
  throw new QuestionGenerationAssignmentBudgetPolicyError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableJsonValue(value[key])]),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableJsonValue(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requiredString(value: unknown, field: string, maxLength = 300): string {
  if (typeof value !== "string" || !value.trim()) {
    policyError("INVALID_ASSIGNMENT_BUDGET_POLICY", `${field} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    policyError(
      "INVALID_ASSIGNMENT_BUDGET_POLICY",
      `${field} exceeds ${maxLength} characters`,
    );
  }
  return normalized;
}

function positiveSafeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    policyError(
      "INVALID_ASSIGNMENT_BUDGET_POLICY",
      `${field} must be a positive safe integer`,
    );
  }
  return Number(value);
}

function nonNegativeSafeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    policyError(
      "INVALID_ASSIGNMENT_BUDGET_POLICY",
      `${field} must be a non-negative safe integer`,
    );
  }
  return Number(value);
}

function parseDate(value: unknown, field: string): Date {
  const raw = requiredString(value, field, 100);
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== raw) {
    policyError(
      "INVALID_ASSIGNMENT_BUDGET_POLICY",
      `${field} must be a canonical ISO timestamp`,
    );
  }
  return parsed;
}

function normalizeDescriptor(
  descriptor: QuestionGenerationAssignmentDescriptor,
): QuestionGenerationAssignmentDescriptor {
  if (!isRecord(descriptor)) {
    policyError("INVALID_ASSIGNMENT_BUDGET_DESCRIPTOR", "descriptor is required");
  }
  const route = descriptor.route;
  if (route !== "FAST" && route !== "TRIGGER") {
    policyError("INVALID_ASSIGNMENT_BUDGET_DESCRIPTOR", "route is invalid");
  }
  const generationPlan = descriptor.generationPlan;
  if (generationPlan !== "STANDARD" && generationPlan !== "PREMIUM") {
    policyError(
      "INVALID_ASSIGNMENT_BUDGET_DESCRIPTOR",
      "generationPlan is invalid",
    );
  }
  return {
    jobId: requiredString(descriptor.jobId, "descriptor.jobId", 200),
    route,
    generationPlan,
    questionType: requiredString(
      descriptor.questionType,
      "descriptor.questionType",
      200,
    ),
    difficulty: requiredString(
      descriptor.difficulty,
      "descriptor.difficulty",
      100,
    ),
  };
}

function descriptorHash(
  descriptor: QuestionGenerationAssignmentDescriptor,
): string {
  return sha256(
    stableJson({
      route: descriptor.route,
      generationPlan: descriptor.generationPlan,
      questionType: descriptor.questionType,
      difficulty: descriptor.difficulty,
    }),
  );
}

function parsePriceSnapshot(
  input: unknown,
  now: Date,
  enforceFreshness: boolean,
): Readonly<AssignmentBudgetPriceSnapshot> {
  if (!isRecord(input)) {
    policyError(
      "INVALID_ASSIGNMENT_BUDGET_POLICY",
      "priceSnapshot is required",
    );
  }
  const declaredHash = requiredString(input.hash, "priceSnapshot.hash", 64)
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(declaredHash)) {
    policyError(
      "INVALID_ASSIGNMENT_BUDGET_POLICY",
      "priceSnapshot.hash must be SHA-256",
    );
  }
  const hashInput = Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== "hash"),
  );
  const actualHash = sha256(stableJson(hashInput));
  if (actualHash !== declaredHash) {
    policyError(
      "ASSIGNMENT_BUDGET_PRICE_HASH_MISMATCH",
      "price snapshot hash does not match its contents",
    );
  }
  const capturedAt = parseDate(input.capturedAt, "priceSnapshot.capturedAt");
  const expiresAt = parseDate(input.expiresAt, "priceSnapshot.expiresAt");
  if (
    enforceFreshness &&
    (
    capturedAt.getTime() > now.getTime() ||
    now.getTime() - capturedAt.getTime() >
      QUESTION_GENERATION_ASSIGNMENT_PRICE_MAX_AGE_MS ||
    expiresAt.getTime() < now.getTime()
    )
  ) {
    policyError(
      "ASSIGNMENT_BUDGET_PRICE_SNAPSHOT_STALE",
      "price snapshot is not fresh and currently valid",
    );
  }
  let endpointOrigin: string;
  try {
    const url = new URL(requiredString(input.endpointOrigin, "endpointOrigin", 2_000));
    if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
      policyError(
        "INVALID_ASSIGNMENT_BUDGET_POLICY",
        "endpointOrigin must contain only scheme and authority",
      );
    }
    endpointOrigin = url.origin;
  } catch (error) {
    if (error instanceof QuestionGenerationAssignmentBudgetPolicyError) throw error;
    policyError(
      "INVALID_ASSIGNMENT_BUDGET_POLICY",
      "endpointOrigin must be an absolute URL origin",
    );
  }
  const endpointPath = requiredString(
    input.endpointPath,
    "priceSnapshot.endpointPath",
    2_000,
  );
  if (!endpointPath.startsWith("/") || endpointPath.includes("#")) {
    policyError(
      "INVALID_ASSIGNMENT_BUDGET_POLICY",
      "endpointPath must be an absolute path without a fragment",
    );
  }
  if (!isRecord(input.rates) || Object.keys(input.rates).length === 0) {
    policyError(
      "INVALID_ASSIGNMENT_BUDGET_POLICY",
      "priceSnapshot.rates must not be empty",
    );
  }
  const rates: Record<string, Readonly<AssignmentBudgetRate>> = {};
  for (const [rawModel, rawRate] of Object.entries(input.rates)) {
    const model = requiredString(rawModel, "priceSnapshot.rates model", 300);
    if (!isRecord(rawRate)) {
      policyError(
        "INVALID_ASSIGNMENT_BUDGET_POLICY",
        `rate for ${model} must be an object`,
      );
    }
    rates[model] = Object.freeze({
      inputUsdMicrosPerMillionTokens: BigInt(
        nonNegativeSafeInteger(
          rawRate.inputUsdMicrosPerMillionTokens,
          `${model}.inputUsdMicrosPerMillionTokens`,
        ),
      ),
      outputUsdMicrosPerMillionTokens: BigInt(
        nonNegativeSafeInteger(
          rawRate.outputUsdMicrosPerMillionTokens,
          `${model}.outputUsdMicrosPerMillionTokens`,
        ),
      ),
      fixedUsdMicrosPerRequest: BigInt(
        nonNegativeSafeInteger(
          rawRate.fixedUsdMicrosPerRequest ?? 0,
          `${model}.fixedUsdMicrosPerRequest`,
        ),
      ),
      fixedInputTokenOverhead: BigInt(
        positiveSafeInteger(
          rawRate.fixedInputTokenOverhead,
          `${model}.fixedInputTokenOverhead`,
        ),
      ),
    });
  }
  const providerRoutingHash = requiredString(
    input.providerRoutingHash,
    "priceSnapshot.providerRoutingHash",
    64,
  ).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(providerRoutingHash)) {
    policyError(
      "INVALID_ASSIGNMENT_BUDGET_POLICY",
      "priceSnapshot.providerRoutingHash must be SHA-256",
    );
  }
  return Object.freeze({
    id: requiredString(input.id, "priceSnapshot.id", 200),
    hash: declaredHash,
    capturedAt,
    expiresAt,
    endpointOrigin,
    endpointPath,
    providerRoutingHash,
    routingPriceCoverage: (() => {
      const coverage = input.routingPriceCoverage;
      if (
        coverage !== "PINNED_PROVIDER_SET_MAX" &&
        coverage !== "ALL_ROUTER_UPSTREAMS_MAX"
      ) {
        policyError(
          "INVALID_ASSIGNMENT_BUDGET_POLICY",
          "price snapshot must attest its upstream price coverage",
        );
      }
      return coverage;
    })(),
    rates: Object.freeze(rates),
  });
}

function selectCell(
  cells: unknown,
  descriptor: QuestionGenerationAssignmentDescriptor,
): Record<string, unknown> {
  if (!Array.isArray(cells) || cells.length === 0) {
    policyError("INVALID_ASSIGNMENT_BUDGET_POLICY", "cells must not be empty");
  }
  const matches = cells.filter(
    (cell): cell is Record<string, unknown> =>
      isRecord(cell) &&
      cell.route === descriptor.route &&
      cell.generationPlan === descriptor.generationPlan &&
      cell.questionType === descriptor.questionType &&
      cell.difficulty === descriptor.difficulty,
  );
  if (matches.length !== 1) {
    policyError(
      "ASSIGNMENT_BUDGET_CELL_MATCH_FAILED",
      `expected exactly one policy cell, found ${matches.length}`,
    );
  }
  return matches[0]!;
}

function isCanaryJob(jobId: string, policyHash: string, basisPoints: number): boolean {
  const bucket = Number.parseInt(sha256(`${policyHash}:${jobId}`).slice(0, 8), 16) % 10_000;
  return bucket < basisPoints;
}

export function readQuestionGenerationAssignmentBudgetAdmission(
  descriptorInput: QuestionGenerationAssignmentDescriptor,
  env: Readonly<Record<string, string | undefined>> = process.env,
  now = new Date(),
): QuestionGenerationAssignmentBudgetAdmission {
  const rawMode = env.QUESTION_GENERATION_ASSIGNMENT_BUDGET_MODE?.trim() || "OFF";
  if (rawMode === "OFF") return { mode: "OFF" };
  if (!ACTIVE_MODES.has(rawMode as QuestionGenerationAssignmentBudgetMode)) {
    policyError(
      "INVALID_ASSIGNMENT_BUDGET_POLICY",
      `unsupported mode ${rawMode}`,
    );
  }
  const descriptor = normalizeDescriptor(descriptorInput);
  const mode = rawMode as QuestionGenerationAssignmentBudgetMode;
  if (mode === "AUDIT") {
    const policyVersion =
      env.QUESTION_GENERATION_ASSIGNMENT_BUDGET_AUDIT_VERSION?.trim() ||
      "qgen-assignment-audit-v1";
    const policyHash = sha256(stableJson({ mode, policyVersion }));
    return Object.freeze({
      mode,
      policyVersion,
      policyHash,
      descriptorHash: descriptorHash(descriptor),
      maxPhysicalCalls: null,
      maxReservedCostMicros: null,
      perCallMaxReservedCostMicros: null,
      maxRequestBodyUtf8Bytes: null,
      maxCompletionCount: null,
      priceSnapshot: null,
      configurationWarning: null,
    });
  }

  const rawJson = env.QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_JSON;
  if (!rawJson) {
    policyError(
      "INVALID_ASSIGNMENT_BUDGET_POLICY",
      "active capped modes require QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_JSON",
    );
  }
  let rawPolicy: unknown;
  try {
    rawPolicy = JSON.parse(rawJson);
  } catch {
    policyError(
      "INVALID_ASSIGNMENT_BUDGET_POLICY",
      "policy JSON could not be parsed",
    );
  }
  if (!isRecord(rawPolicy)) {
    policyError("INVALID_ASSIGNMENT_BUDGET_POLICY", "policy must be an object");
  }
  const policyHash = sha256(stableJson(rawPolicy));
  let effectiveMode = mode;
  if (mode === "CANARY_ENFORCE") {
    const basisPoints = nonNegativeSafeInteger(
      rawPolicy.canaryBasisPoints,
      "policy.canaryBasisPoints",
    );
    if (basisPoints > 10_000) {
      policyError(
        "INVALID_ASSIGNMENT_BUDGET_POLICY",
        "canaryBasisPoints must be between 0 and 10000",
      );
    }
    if (!isCanaryJob(descriptor.jobId, policyHash, basisPoints)) {
      effectiveMode = "SHADOW";
    }
  }

  try {
    const policyVersion = requiredString(
      rawPolicy.version,
      "policy.version",
      200,
    );
    const declaredPolicyHash =
      env.QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_SHA256
        ?.trim()
        .toLowerCase();
    if (!declaredPolicyHash || declaredPolicyHash !== policyHash) {
      policyError(
        "ASSIGNMENT_BUDGET_POLICY_HASH_MISMATCH",
        "policy hash is absent or does not match the exact JSON",
      );
    }
    const cell = selectCell(rawPolicy.cells, descriptor);
    const maxPhysicalCalls = positiveSafeInteger(
      cell.maxPhysicalCalls,
      "cell.maxPhysicalCalls",
    );
    const maxReservedCostMicros = BigInt(
      positiveSafeInteger(
        cell.maxReservedCostMicros,
        "cell.maxReservedCostMicros",
      ),
    );
    const perCallMaxReservedCostMicros = BigInt(
      positiveSafeInteger(
        cell.perCallMaxReservedCostMicros,
        "cell.perCallMaxReservedCostMicros",
      ),
    );
    if (perCallMaxReservedCostMicros > maxReservedCostMicros) {
      policyError(
        "INVALID_ASSIGNMENT_BUDGET_POLICY",
        "per-call cost cap exceeds assignment cost cap",
      );
    }
    const priceSnapshot = parsePriceSnapshot(
      rawPolicy.priceSnapshot,
      now,
      effectiveMode === "CANARY_ENFORCE" || effectiveMode === "ENFORCE",
    );
    return Object.freeze({
      mode: effectiveMode,
      policyVersion,
      policyHash,
      descriptorHash: descriptorHash(descriptor),
      maxPhysicalCalls,
      maxReservedCostMicros,
      perCallMaxReservedCostMicros,
      maxRequestBodyUtf8Bytes: positiveSafeInteger(
        cell.maxRequestBodyUtf8Bytes,
        "cell.maxRequestBodyUtf8Bytes",
      ),
      maxCompletionCount: positiveSafeInteger(
        cell.maxCompletionCount,
        "cell.maxCompletionCount",
      ),
      priceSnapshot,
      configurationWarning: null,
    });
  } catch (error) {
    if (mode === "CANARY_ENFORCE" && effectiveMode === "SHADOW") {
      const warningCode =
        error instanceof QuestionGenerationAssignmentBudgetPolicyError
          ? error.code
          : "INVALID_ASSIGNMENT_BUDGET_POLICY";
      return createQuestionGenerationAssignmentBudgetAuditFallback(
        descriptor,
        warningCode,
      );
    }
    throw error;
  }
}

export function createQuestionGenerationAssignmentBudgetAuditFallback(
  descriptorInput: QuestionGenerationAssignmentDescriptor,
  warningCode: string,
): ActiveQuestionGenerationAssignmentBudgetPolicy {
  const descriptor = normalizeDescriptor(descriptorInput);
  const configurationWarning = requiredString(
    warningCode,
    "configurationWarning",
    200,
  );
  const policyVersion = "qgen-assignment-shadow-invalid-fallback-v1";
  const policyHash = sha256(
    stableJson({ mode: "AUDIT", policyVersion, configurationWarning }),
  );
  return Object.freeze({
    mode: "AUDIT",
    policyVersion,
    policyHash,
    descriptorHash: descriptorHash(descriptor),
    maxPhysicalCalls: null,
    maxReservedCostMicros: null,
    perCallMaxReservedCostMicros: null,
    maxRequestBodyUtf8Bytes: null,
    maxCompletionCount: null,
    priceSnapshot: null,
    configurationWarning,
  });
}

function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - BigInt(1)) / denominator;
}

export function reserveQuestionGenerationAssignmentCallCost(
  policy: Readonly<ActiveQuestionGenerationAssignmentBudgetPolicy>,
  request: Readonly<AtlasProductionWireRequestFacts>,
  now = new Date(),
): bigint {
  if (policy.mode === "AUDIT") return BigInt(0);
  const snapshot = policy.priceSnapshot;
  if (!snapshot) {
    policyError(
      "ASSIGNMENT_BUDGET_PRICE_SNAPSHOT_MISSING",
      "capped modes require a price snapshot",
    );
  }
  if (
    (policy.mode === "CANARY_ENFORCE" || policy.mode === "ENFORCE") &&
    (
    now.getTime() < snapshot.capturedAt.getTime() ||
    now.getTime() - snapshot.capturedAt.getTime() >
      QUESTION_GENERATION_ASSIGNMENT_PRICE_MAX_AGE_MS ||
    now.getTime() > snapshot.expiresAt.getTime()
    )
  ) {
    policyError(
      "ASSIGNMENT_BUDGET_PRICE_SNAPSHOT_STALE",
      "price snapshot became stale before dispatch",
    );
  }
  if (
    snapshot.routingPriceCoverage === "PINNED_PROVIDER_SET_MAX" &&
    !request.providerRoutingPinned
  ) {
    policyError(
      "ASSIGNMENT_BUDGET_PROVIDER_ROUTE_NOT_PINNED",
      "priced provider-set coverage requires fallback-disabled wire routing",
    );
  }
  if (!request.reasoningOff) {
    policyError(
      "ASSIGNMENT_BUDGET_REASONING_NOT_DISABLED",
      "question-generation enforcement requires reasoning disabled on the wire",
    );
  }
  if (
    request.endpointOrigin !== snapshot.endpointOrigin ||
    request.endpointPath !== snapshot.endpointPath
  ) {
    policyError(
      "ASSIGNMENT_BUDGET_ENDPOINT_MISMATCH",
      "wire endpoint is outside the price snapshot",
    );
  }
  if (
    !/^[a-f0-9]{64}$/.test(snapshot.providerRoutingHash) ||
    request.providerRoutingHash !== snapshot.providerRoutingHash
  ) {
    policyError(
      "ASSIGNMENT_BUDGET_PROVIDER_ROUTE_MISMATCH",
      "wire provider routing is not the hash-pinned priced route",
    );
  }
  if (!request.textOnly) {
    policyError(
      "ASSIGNMENT_BUDGET_NON_TEXT_INPUT",
      "non-text input has no proven token-cost upper bound",
    );
  }
  if (!request.knownCostShape) {
    policyError(
      "ASSIGNMENT_BUDGET_WIRE_SHAPE_UNPRICED",
      "wire request contains an unattested top-level cost surface",
    );
  }
  if (
    policy.maxRequestBodyUtf8Bytes === null ||
    request.requestBodyUtf8Bytes > policy.maxRequestBodyUtf8Bytes
  ) {
    policyError(
      "ASSIGNMENT_BUDGET_REQUEST_TOO_LARGE",
      "wire request exceeds its byte bound",
    );
  }
  if (
    policy.maxCompletionCount === null ||
    request.completionCount > policy.maxCompletionCount
  ) {
    policyError(
      "ASSIGNMENT_BUDGET_COMPLETION_COUNT_EXCEEDED",
      "wire completion count exceeds its bound",
    );
  }
  if (request.outputTokenCap === null) {
    policyError(
      "ASSIGNMENT_BUDGET_OUTPUT_CAP_MISSING",
      "wire request has no output-token ceiling",
    );
  }
  const rate = snapshot.rates[request.model];
  if (!rate) {
    policyError(
      "ASSIGNMENT_BUDGET_MODEL_PRICE_MISSING",
      "wire model is absent from the price snapshot",
    );
  }
  // For the text-only JSON request, UTF-8 bytes are a conservative upper bound
  // on tokenizer units. Output cap is multiplied by the exact wire n.
  const inputUnits =
    BigInt(request.requestBodyUtf8Bytes) + rate.fixedInputTokenOverhead;
  const outputUnits =
    BigInt(request.outputTokenCap) * BigInt(request.completionCount);
  const variableMicros = ceilDivide(
    inputUnits * rate.inputUsdMicrosPerMillionTokens +
      outputUnits * rate.outputUsdMicrosPerMillionTokens,
    MICROS_PER_DOLLAR,
  );
  const reservation = variableMicros + rate.fixedUsdMicrosPerRequest;
  if (
    policy.perCallMaxReservedCostMicros === null ||
    reservation > policy.perCallMaxReservedCostMicros
  ) {
    policyError(
      "ASSIGNMENT_BUDGET_PER_CALL_COST_EXCEEDED",
      "worst-case call cost exceeds the frozen per-call cap",
    );
  }
  return reservation;
}
