import {
  MAX_PER_RESPONSE_ACTUAL_COST_USD_V5,
  MAX_PER_RESPONSE_USAGE_TOKENS_V5,
  sha256V5,
  stableJsonV5,
  type JsonObject,
} from "./protocol-core";
import { observeDuplicateJsonKeysV5 } from "./strict-json-observer";

export interface BillingEvidenceV5 {
  costActualKnown: boolean;
  costDisposition: "ACTUAL_KNOWN" | "ABSENT_OR_MALFORMED_UNKNOWN" |
    "EXPLICIT_POSITIVE_UNREPRESENTABLE" | "AMBIGUOUS_DUPLICATE_BILLING_KEYS" |
    "BYOK_OR_MALFORMED_BILLING_MANUAL_RECONCILIATION";
  manualCostReconciliationRequired: boolean;
  explicitPositiveCostEvidenceHash: string | null;
  usageActualKnown: boolean;
  actualCostUsd: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  reasoningTokens: number | null;
  reasoningDisabledResponseCompliant: boolean;
  cachedTokens: number | null;
  cacheDisabledResponseCompliant: boolean;
  isByok: boolean | null;
  nonByokResponseCompliant: boolean;
  defects: string[];
  billingEvidenceHash: string;
}

export interface ParsedResponseEvidenceV5 {
  providerRequestId: string;
  requestedModel: string;
  servedModel: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  actualCostUsd: number;
  reasoningTokens: number | null;
  cachedTokens: number | null;
  finishReason: string;
  questionHash: string;
  billingEvidenceHash: string;
  parserEvidenceHash: string;
}

function maybeRecord(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function record(value: unknown, label: string): JsonObject {
  const row = maybeRecord(value);
  if (!row) throw new Error(`${label} must be an object`);
  return row;
}

function exactObjectKeys(value: JsonObject, required: readonly string[], optional: readonly string[], label: string): void {
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new Error(`${label}.${key} is required`);
  }
  const allowed = new Set([...required, ...optional]);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) throw new Error(`${label} contains unexpected fields: ${unexpected.sort().join(",")}`);
}

function finite(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function safeInteger(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a safe integer >= ${minimum}`);
  }
  return value;
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is missing`);
  return value;
}

export function extractConnectivityBillingEvidenceV5(rawText: string): BillingEvidenceV5 {
  const defects: string[] = [];
  let duplicateBillingKeys = false;
  let strictObservationFailed = false;
  try {
    const duplicates = observeDuplicateJsonKeysV5(rawText);
    duplicateBillingKeys = duplicates.length > 0;
    if (duplicateBillingKeys) defects.push("duplicate_billing_keys_manual_reconciliation");
  } catch {
    strictObservationFailed = true;
    defects.push("strict_json_observation_failed");
  }
  let response: JsonObject | null = null;
  try {
    response = maybeRecord(JSON.parse(rawText) as unknown);
    if (!response) defects.push("response_not_object");
  } catch {
    defects.push("response_not_json");
  }
  if (strictObservationFailed && response) duplicateBillingKeys = true;
  const usage = response ? maybeRecord(response.usage) : null;
  if (!usage) defects.push("usage_not_object");

  const isByok = usage && typeof usage.is_byok === "boolean" ? usage.is_byok : null;
  const byokFieldPresent = usage ? Object.hasOwn(usage, "is_byok") : false;
  const nonByokResponseCompliant = isByok === false;
  const byokOrMalformedBilling = isByok !== false;
  if (isByok === true) defects.push("byok_billing_requires_manual_reconciliation");
  else if (byokFieldPresent && isByok === null) defects.push("malformed_byok_billing_requires_manual_reconciliation");
  else if (!byokFieldPresent) defects.push("absent_byok_attestation_requires_manual_reconciliation");

  const positiveUpstreamCostEvidence = usage
    ? [
        ["usage.cost", usage.cost],
        ...Object.entries(maybeRecord(usage.cost_details) ?? {})
          .filter(([key]) => /cost/iu.test(key))
          .map(([key, value]) => [`usage.cost_details.${key}`, value]),
      ].flatMap(([field, value]) => typeof value === "number" &&
          ((Number.isFinite(value) && value > 0) || value === Number.POSITIVE_INFINITY)
        ? [{ field: String(field), canonicalDecimal: String(value) }]
        : [])
    : [];

  let actualCostUsd: number | null = null;
  let costDisposition: BillingEvidenceV5["costDisposition"] = "ABSENT_OR_MALFORMED_UNKNOWN";
  let explicitPositiveCostEvidenceHash: string | null = null;
  if (duplicateBillingKeys) {
    costDisposition = "AMBIGUOUS_DUPLICATE_BILLING_KEYS";
    explicitPositiveCostEvidenceHash = sha256V5(stableJsonV5({
      type: "duplicate-billing-keys",
      rawResponseSha256: sha256V5(rawText),
    }));
  } else if (byokOrMalformedBilling) {
    costDisposition = "BYOK_OR_MALFORMED_BILLING_MANUAL_RECONCILIATION";
    if (positiveUpstreamCostEvidence.length > 0) {
      explicitPositiveCostEvidenceHash = sha256V5(stableJsonV5({
        type: "byok-positive-upstream-cost-evidence",
        evidence: positiveUpstreamCostEvidence,
        rawResponseSha256: sha256V5(rawText),
      }));
    }
  } else if (usage && typeof usage.cost === "number" && Number.isFinite(usage.cost) && usage.cost >= 0 &&
      usage.cost <= MAX_PER_RESPONSE_ACTUAL_COST_USD_V5 &&
      Number.isSafeInteger(Math.ceil(usage.cost * 1e12))) {
    actualCostUsd = usage.cost;
    costDisposition = "ACTUAL_KNOWN";
  } else if (usage && typeof usage.cost === "number" &&
      ((Number.isFinite(usage.cost) && usage.cost > 0) || usage.cost === Number.POSITIVE_INFINITY)) {
    costDisposition = "EXPLICIT_POSITIVE_UNREPRESENTABLE";
    explicitPositiveCostEvidenceHash = sha256V5(stableJsonV5({
      type: Number.isFinite(usage.cost) ? "finite-positive-number" : "json-numeric-overflow-positive-infinity",
      canonicalDecimal: String(usage.cost),
      rawResponseSha256: sha256V5(rawText),
    }));
    defects.push("explicit_positive_cost_unrepresentable_manual_reconciliation");
  } else {
    defects.push("cost_unknown_invalid_or_unroundable");
  }

  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let totalTokens: number | null = null;
  let reasoningTokens: number | null = null;
  let reasoningDisabledResponseCompliant = true;
  let cachedTokens: number | null = null;
  let cacheDisabledResponseCompliant = true;
  if (usage &&
      typeof usage.prompt_tokens === "number" && Number.isSafeInteger(usage.prompt_tokens) && usage.prompt_tokens >= 1 &&
      usage.prompt_tokens <= MAX_PER_RESPONSE_USAGE_TOKENS_V5 &&
      typeof usage.completion_tokens === "number" && Number.isSafeInteger(usage.completion_tokens) && usage.completion_tokens >= 0 &&
      usage.completion_tokens <= MAX_PER_RESPONSE_USAGE_TOKENS_V5 &&
      typeof usage.total_tokens === "number" && Number.isSafeInteger(usage.total_tokens) && usage.total_tokens >= 1 &&
      usage.total_tokens <= MAX_PER_RESPONSE_USAGE_TOKENS_V5 &&
      Number.isSafeInteger(usage.prompt_tokens + usage.completion_tokens) &&
      usage.total_tokens === usage.prompt_tokens + usage.completion_tokens) {
    promptTokens = usage.prompt_tokens;
    completionTokens = usage.completion_tokens;
    totalTokens = usage.total_tokens;
  } else {
    defects.push("usage_unknown_invalid_or_inconsistent");
  }
  if (usage && Object.hasOwn(usage, "completion_tokens_details")) {
    const details = maybeRecord(usage.completion_tokens_details);
    if (details && Object.keys(details).length === 1 && Object.hasOwn(details, "reasoning_tokens") &&
        typeof details.reasoning_tokens === "number" && Number.isSafeInteger(details.reasoning_tokens) &&
        details.reasoning_tokens >= 0 && details.reasoning_tokens <= MAX_PER_RESPONSE_USAGE_TOKENS_V5) {
      reasoningTokens = details.reasoning_tokens;
      if (reasoningTokens > 0) {
        reasoningDisabledResponseCompliant = false;
        defects.push("reasoning_tokens_positive_despite_disabled_request");
      }
    } else {
      reasoningDisabledResponseCompliant = false;
      defects.push("reasoning_token_details_malformed");
    }
  }
  if (usage && Object.hasOwn(usage, "prompt_tokens_details")) {
    const details = maybeRecord(usage.prompt_tokens_details);
    if (details && Object.keys(details).length === 1 && Object.hasOwn(details, "cached_tokens") &&
        typeof details.cached_tokens === "number" && Number.isSafeInteger(details.cached_tokens) &&
        details.cached_tokens >= 0 && details.cached_tokens <= MAX_PER_RESPONSE_USAGE_TOKENS_V5) {
      cachedTokens = details.cached_tokens;
      if (cachedTokens > 0) {
        cacheDisabledResponseCompliant = false;
        defects.push("cached_tokens_positive_despite_cacheless_request");
      }
    } else {
      cacheDisabledResponseCompliant = false;
      defects.push("cached_token_details_malformed");
    }
  }
  if (usage && Object.keys(usage).some((key) => /cache/iu.test(key))) {
    cacheDisabledResponseCompliant = false;
    defects.push("unknown_cache_usage_field");
  }

  const core = {
    billingParserVersion: "campaign-v6-connectivity-pilot-billing-parser-v5",
    costActualKnown: actualCostUsd !== null,
    costDisposition,
    manualCostReconciliationRequired: costDisposition === "EXPLICIT_POSITIVE_UNREPRESENTABLE" ||
      costDisposition === "AMBIGUOUS_DUPLICATE_BILLING_KEYS" ||
      costDisposition === "BYOK_OR_MALFORMED_BILLING_MANUAL_RECONCILIATION",
    explicitPositiveCostEvidenceHash,
    usageActualKnown: promptTokens !== null,
    actualCostUsd,
    promptTokens,
    completionTokens,
    totalTokens,
    reasoningTokens,
    reasoningDisabledResponseCompliant,
    cachedTokens,
    cacheDisabledResponseCompliant,
    isByok,
    nonByokResponseCompliant,
    defects: [...new Set(defects)].sort(),
  };
  return { ...core, billingEvidenceHash: sha256V5(stableJsonV5(core)) };
}

const SUPPORTED_SCHEMA_KEYS = new Set([
  "$schema", "type", "properties", "required", "additionalProperties", "items",
  "minItems", "maxItems", "minLength", "maxLength", "enum", "const", "minimum",
  "maximum", "pattern", "description", "title",
]);

function jsonEqual(left: unknown, right: unknown): boolean {
  return stableJsonV5(left) === stableJsonV5(right);
}

function assertMatchesExactSchema(value: unknown, schemaValue: unknown, label: string, depth = 0): void {
  if (depth > 64) throw new Error(`${label} schema nesting exceeds verifier bound`);
  const schema = record(schemaValue, `${label} schema`);
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_SCHEMA_KEYS.has(key)) throw new Error(`${label} uses unsupported schema keyword ${key}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => jsonEqual(candidate, value))) {
    throw new Error(`${label} is outside schema enum`);
  }
  if (Object.hasOwn(schema, "const") && !jsonEqual(schema.const, value)) {
    throw new Error(`${label} differs from schema const`);
  }
  const type = schema.type;
  if (typeof type !== "string") throw new Error(`${label} schema must declare one explicit type`);
  if (type === "object") {
    const objectValue = record(value, label);
    const properties = record(schema.properties, `${label} schema.properties`);
    if (!Array.isArray(schema.required) || schema.required.some((entry) => typeof entry !== "string")) {
      throw new Error(`${label} schema.required must be a string array`);
    }
    for (const required of schema.required as string[]) {
      if (!Object.hasOwn(objectValue, required)) throw new Error(`${label}.${required} is required by exact response schema`);
    }
    if (schema.additionalProperties !== false) {
      throw new Error(`${label} exact response schema must set additionalProperties=false`);
    }
    for (const [key, child] of Object.entries(objectValue)) {
      if (!Object.hasOwn(properties, key)) throw new Error(`${label}.${key} is not allowed by exact response schema`);
      assertMatchesExactSchema(child, properties[key], `${label}.${key}`, depth + 1);
    }
    return;
  }
  if (type === "array") {
    if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
    const minItems = schema.minItems === undefined ? 0 : safeInteger(schema.minItems, `${label} schema.minItems`);
    const maxItems = schema.maxItems === undefined ? Number.MAX_SAFE_INTEGER : safeInteger(schema.maxItems, `${label} schema.maxItems`);
    if (value.length < minItems || value.length > maxItems) throw new Error(`${label} array length violates exact response schema`);
    if (!schema.items) throw new Error(`${label} schema.items is required`);
    value.forEach((child, index) => assertMatchesExactSchema(child, schema.items, `${label}[${index}]`, depth + 1));
    return;
  }
  if (type === "string") {
    if (typeof value !== "string") throw new Error(`${label} must be a string`);
    const minLength = schema.minLength === undefined ? 0 : safeInteger(schema.minLength, `${label} schema.minLength`);
    const maxLength = schema.maxLength === undefined ? Number.MAX_SAFE_INTEGER : safeInteger(schema.maxLength, `${label} schema.maxLength`);
    if (value.length < minLength || value.length > maxLength) throw new Error(`${label} string length violates exact response schema`);
    if (schema.pattern !== undefined) {
      if (typeof schema.pattern !== "string" || !new RegExp(schema.pattern, "u").test(value)) throw new Error(`${label} violates schema pattern`);
    }
    return;
  }
  if (type === "integer") {
    safeInteger(value, label, Number.isFinite(schema.minimum) ? Number(schema.minimum) : Number.MIN_SAFE_INTEGER);
    if (typeof schema.maximum === "number" && (value as number) > schema.maximum) throw new Error(`${label} exceeds schema maximum`);
    return;
  }
  if (type === "number") {
    const number = finite(value, label, Number.isFinite(schema.minimum) ? Number(schema.minimum) : -Number.MAX_VALUE);
    if (typeof schema.maximum === "number" && number > schema.maximum) throw new Error(`${label} exceeds schema maximum`);
    return;
  }
  if (type === "boolean") {
    if (typeof value !== "boolean") throw new Error(`${label} must be boolean`);
    return;
  }
  if (type === "null") {
    if (value !== null) throw new Error(`${label} must be null`);
    return;
  }
  throw new Error(`${label} uses unsupported schema type ${type}`);
}

export function parseConnectivityResponseV5(input: {
  rawText: string;
  requestedModel: string;
  allowedServedModels: readonly string[];
  expectedProvider: string;
  allowedFinishReasons: readonly ["stop"];
  responseSchema: JsonObject;
}): ParsedResponseEvidenceV5 {
  const responseDuplicates = observeDuplicateJsonKeysV5(input.rawText);
  if (responseDuplicates.length > 0) throw new Error("response contains duplicate JSON object keys");
  const response = record(JSON.parse(input.rawText) as unknown, "response");
  exactObjectKeys(
    response,
    ["id", "model", "provider", "object", "created", "choices", "usage"],
    ["system_fingerprint"],
    "response",
  );
  const providerRequestId = nonempty(response.id, "response.id");
  const servedModel = nonempty(response.model, "response.model");
  const provider = nonempty(response.provider, "response.provider");
  if (response.object !== "chat.completion") throw new Error("response.object must be chat.completion");
  safeInteger(response.created, "response.created", 1);
  if (Object.hasOwn(response, "system_fingerprint") &&
      response.system_fingerprint !== null && typeof response.system_fingerprint !== "string") {
    throw new Error("response.system_fingerprint must be string or null");
  }
  if (!input.allowedServedModels.includes(servedModel)) throw new Error("served model is not price-attested");
  if (provider !== input.expectedProvider) throw new Error("provider route is not the exact price-attested route");
  if (!Array.isArray(response.choices) || response.choices.length !== 1) throw new Error("response must have exactly one choice");
  const choice = record(response.choices[0], "response.choices[0]");
  exactObjectKeys(choice, ["index", "finish_reason", "message"], ["native_finish_reason", "logprobs"], "response.choices[0]");
  if (choice.index !== 0) throw new Error("choice index must be zero");
  if (Object.hasOwn(choice, "native_finish_reason") &&
      choice.native_finish_reason !== null && typeof choice.native_finish_reason !== "string") {
    throw new Error("choice.native_finish_reason must be string or null");
  }
  if (Object.hasOwn(choice, "logprobs") && choice.logprobs !== null) {
    throw new Error("choice.logprobs must be null when not requested");
  }
  const finishReason = nonempty(choice.finish_reason, "choice.finish_reason");
  if (!input.allowedFinishReasons.includes(finishReason as "stop")) {
    throw new Error("choice.finish_reason is not an allowed terminal non-truncated reason");
  }
  const message = record(choice.message, "choice.message");
  exactObjectKeys(message, ["role", "content"], [], "choice.message");
  if (message.role !== "assistant") throw new Error("choice.message.role must be assistant");
  const content = nonempty(message.content, "choice.message.content");
  if (observeDuplicateJsonKeysV5(content).length > 0) {
    throw new Error("choice.message.content JSON contains duplicate object keys");
  }
  const parsedContent = record(JSON.parse(content) as unknown, "choice.message.content JSON");
  assertMatchesExactSchema(parsedContent, input.responseSchema, "choice.message.content JSON");
  if (!Array.isArray(parsedContent.questions) || parsedContent.questions.length !== 1) {
    throw new Error("parser requires exactly one semantic question");
  }
  const question = record(parsedContent.questions[0], "questions[0]");
  if (Object.keys(question).length === 0) throw new Error("question is empty");
  const billing = extractConnectivityBillingEvidenceV5(input.rawText);
  if (!billing.nonByokResponseCompliant) {
    throw new Error("response.usage.is_byok must be explicitly false for non-BYOK billing attestation");
  }
  if (!billing.costActualKnown || !billing.usageActualKnown || billing.actualCostUsd === null ||
      billing.promptTokens === null || billing.completionTokens === null || billing.totalTokens === null) {
    throw new Error("successful parser requires exact final usage and actual cost evidence");
  }
  const usage = record(response.usage, "response.usage");
  exactObjectKeys(usage, ["prompt_tokens", "completion_tokens", "total_tokens", "cost"], [
    "prompt_tokens_details", "completion_tokens_details", "cost_details", "is_byok",
  ], "response.usage");
  if (Object.hasOwn(usage, "prompt_tokens_details")) {
    const promptDetails = record(usage.prompt_tokens_details, "response.usage.prompt_tokens_details");
    exactObjectKeys(promptDetails, ["cached_tokens"], [], "response.usage.prompt_tokens_details");
    if (safeInteger(promptDetails.cached_tokens, "response.usage.prompt_tokens_details.cached_tokens") !== 0) {
      throw new Error("response reports cached tokens despite the cacheless exact request");
    }
  }
  if (Object.hasOwn(usage, "completion_tokens_details")) {
    const completionDetails = record(usage.completion_tokens_details, "response.usage.completion_tokens_details");
    exactObjectKeys(completionDetails, ["reasoning_tokens"], [], "response.usage.completion_tokens_details");
    safeInteger(completionDetails.reasoning_tokens, "response.usage.completion_tokens_details.reasoning_tokens");
  }
  if (Object.hasOwn(usage, "cost_details")) {
    const costDetails = record(usage.cost_details, "response.usage.cost_details");
    exactObjectKeys(costDetails, [
      "upstream_inference_cost", "upstream_inference_prompt_cost", "upstream_inference_completions_cost",
    ], [], "response.usage.cost_details");
    for (const key of Object.keys(costDetails)) finite(costDetails[key], `response.usage.cost_details.${key}`);
  }
  if (usage.is_byok !== false || !billing.nonByokResponseCompliant) {
    throw new Error("response.usage.is_byok must be explicitly false for non-BYOK billing attestation");
  }
  if (!billing.reasoningDisabledResponseCompliant) {
    throw new Error("response reports reasoning tokens despite the reasoning-disabled exact request");
  }
  if (!billing.cacheDisabledResponseCompliant) {
    throw new Error("response cache usage is positive, malformed, or outside the exact attestation shape");
  }
  const evidenceCore = {
    parserVersion: "campaign-v6-connectivity-pilot-response-parser-v5",
    providerRequestId,
    requestedModel: input.requestedModel,
    servedModel,
    provider,
    promptTokens: billing.promptTokens,
    completionTokens: billing.completionTokens,
    totalTokens: billing.totalTokens,
    actualCostUsd: billing.actualCostUsd,
    reasoningTokens: billing.reasoningTokens,
    cachedTokens: billing.cachedTokens,
    finishReason,
    questionHash: sha256V5(stableJsonV5(question)),
    billingEvidenceHash: billing.billingEvidenceHash,
    responseSchemaSha256: sha256V5(stableJsonV5(input.responseSchema)),
    semanticQuestionCount: 1,
    choiceCount: 1,
    exactMessageShape: ["content", "role"],
  };
  return { ...evidenceCore, parserEvidenceHash: sha256V5(stableJsonV5(evidenceCore)) };
}
