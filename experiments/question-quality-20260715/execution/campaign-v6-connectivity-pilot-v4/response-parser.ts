import { sha256V4, stableJsonV4, type JsonObject } from "./protocol-core";

export interface ParsedResponseEvidenceV4 {
  providerRequestId: string;
  requestedModel: string;
  servedModel: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  actualCostUsd: number;
  finishReason: string;
  questionHash: string;
  parserEvidenceHash: string;
}

function record(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonObject;
}

function finite(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) throw new Error(`${label} is invalid`);
  return value;
}

function safeInteger(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return value;
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is missing`);
  return value;
}

const SUPPORTED_SCHEMA_KEYS = new Set([
  "$schema", "type", "properties", "required", "additionalProperties", "items",
  "minItems", "maxItems", "minLength", "maxLength", "enum", "const", "minimum",
  "maximum", "pattern", "description", "title",
]);

function jsonEqual(left: unknown, right: unknown): boolean {
  return stableJsonV4(left) === stableJsonV4(right);
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

export function parseConnectivityResponseV4(input: {
  rawText: string;
  requestedModel: string;
  allowedServedModels: readonly string[];
  expectedProvider: string;
  allowedFinishReasons: readonly ["stop"];
  responseSchema: JsonObject;
}): ParsedResponseEvidenceV4 {
  const response = record(JSON.parse(input.rawText) as unknown, "response");
  const providerRequestId = nonempty(response.id, "response.id");
  const servedModel = nonempty(response.model, "response.model");
  const provider = nonempty(response.provider, "response.provider");
  if (!input.allowedServedModels.includes(servedModel)) throw new Error("served model is not price-attested");
  if (provider !== input.expectedProvider) throw new Error("provider route is not the exact price-attested route");
  if (!Array.isArray(response.choices) || response.choices.length !== 1) throw new Error("response must have exactly one choice");
  const choice = record(response.choices[0], "response.choices[0]");
  if (choice.index !== 0) throw new Error("choice index must be zero");
  const finishReason = nonempty(choice.finish_reason, "choice.finish_reason");
  if (!input.allowedFinishReasons.includes(finishReason as "stop")) {
    throw new Error("choice.finish_reason is not an allowed terminal non-truncated reason");
  }
  const message = record(choice.message, "choice.message");
  const content = nonempty(message.content, "choice.message.content");
  const parsedContent = record(JSON.parse(content) as unknown, "choice.message.content JSON");
  assertMatchesExactSchema(parsedContent, input.responseSchema, "choice.message.content JSON");
  if (!Array.isArray(parsedContent.questions) || parsedContent.questions.length !== 1) {
    throw new Error("parser requires exactly one semantic question");
  }
  const question = record(parsedContent.questions[0], "questions[0]");
  if (Object.keys(question).length === 0) throw new Error("question is empty");
  const usage = record(response.usage, "response.usage");
  const promptTokens = safeInteger(usage.prompt_tokens, "usage.prompt_tokens", 1);
  const completionTokens = safeInteger(usage.completion_tokens, "usage.completion_tokens");
  const totalTokens = safeInteger(usage.total_tokens, "usage.total_tokens", 1);
  if (totalTokens !== promptTokens + completionTokens) throw new Error("usage token total is inconsistent");
  const actualCostUsd = finite(usage.cost, "usage.cost");
  const evidenceCore = {
    parserVersion: "campaign-v6-connectivity-pilot-response-parser-v4",
    providerRequestId,
    requestedModel: input.requestedModel,
    servedModel,
    provider,
    promptTokens,
    completionTokens,
    totalTokens,
    actualCostUsd,
    finishReason,
    questionHash: sha256V4(stableJsonV4(question)),
    responseSchemaSha256: sha256V4(stableJsonV4(input.responseSchema)),
    semanticQuestionCount: 1,
    choiceCount: 1,
  };
  return { ...evidenceCore, parserEvidenceHash: sha256V4(stableJsonV4(evidenceCore)) };
}
