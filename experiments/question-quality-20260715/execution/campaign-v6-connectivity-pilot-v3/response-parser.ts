import { sha256V3, stableJsonV3, type JsonObject } from "./protocol-core";

export interface ParsedResponseEvidenceV3 {
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

function nonempty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is missing`);
  return value;
}

export function parseConnectivityResponseV3(input: {
  rawText: string;
  requestedModel: string;
  allowedServedModels: readonly string[];
  expectedProvider: string;
}): ParsedResponseEvidenceV3 {
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
  const message = record(choice.message, "choice.message");
  const content = nonempty(message.content, "choice.message.content");
  const parsedContent = record(JSON.parse(content) as unknown, "choice.message.content JSON");
  if (!Array.isArray(parsedContent.questions) || parsedContent.questions.length !== 1) {
    throw new Error("parser requires exactly one semantic question");
  }
  const question = record(parsedContent.questions[0], "questions[0]");
  if (Object.keys(question).length === 0) throw new Error("question is empty");
  const usage = record(response.usage, "response.usage");
  const promptTokens = finite(usage.prompt_tokens, "usage.prompt_tokens", 1);
  const completionTokens = finite(usage.completion_tokens, "usage.completion_tokens");
  const totalTokens = finite(usage.total_tokens, "usage.total_tokens", 1);
  if (totalTokens < promptTokens + completionTokens) throw new Error("usage token total is inconsistent");
  const actualCostUsd = finite(usage.cost, "usage.cost");
  const evidenceCore = {
    parserVersion: "campaign-v6-connectivity-pilot-response-parser-v3",
    providerRequestId,
    requestedModel: input.requestedModel,
    servedModel,
    provider,
    promptTokens,
    completionTokens,
    totalTokens,
    actualCostUsd,
    finishReason,
    questionHash: sha256V3(stableJsonV3(question)),
    semanticQuestionCount: 1,
    choiceCount: 1,
  };
  return { ...evidenceCore, parserEvidenceHash: sha256V3(stableJsonV3(evidenceCore)) };
}
