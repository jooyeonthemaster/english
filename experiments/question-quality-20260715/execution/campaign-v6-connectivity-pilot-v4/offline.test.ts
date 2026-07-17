import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { computeCompilerClosureV4 } from "./compiler-closure.mts";
import { computeLiveClosureV4, LIVE_ENTRYPOINTS_V4 } from "./live-closure.mts";
import { buildPublicPriceSnapshotV4, priceEvidenceForModelV4 } from "./price-snapshot-core";
import { parseConnectivityResponseV4 } from "./response-parser";
import { sha256V4, stableJsonV4, validatePriceSnapshotV4, validateProtocolV4, type JsonObject } from "./protocol-core";
import { runDeterministicLocalScenarioV4 } from "./test-support";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const protocol = validateProtocolV4(JSON.parse(readFileSync(path.join(here, "protocol-v4.json"), "utf8")) as unknown);
const exactWire = JSON.parse(readFileSync(path.join(here, "private/exact-wire-v4.private.json"), "utf8")) as { rows: Array<{ bodyText: string }> };
const standardBody = JSON.parse(exactWire.rows[0]!.bodyText) as JsonObject;
const responseSchema = ((standardBody.response_format as JsonObject).json_schema as JsonObject).schema as JsonObject;

const rawModels = {
  data: [
    { id: "google/gemini-3.5-flash", canonical_slug: "google/gemini-3.5-flash-20260519", pricing: { prompt: "0.0000015", completion: "0.000009", image: "0" } },
    { id: "google/gemini-3.1-pro-preview", canonical_slug: "google/gemini-3.1-pro-preview-20260401", pricing: { prompt: "0.000002", completion: "0.000012", image: "0" } },
  ],
};

function endpointPayload(modelId: string, exactProvider = "Google Vertex") {
  return {
    data: {
      endpoints: [
        {
          provider_name: exactProvider,
          name: `${modelId}:vertex`,
          tag: "google-vertex/global",
          status: "active",
          context_length: 1048576,
          supported_parameters: ["structured_outputs", "response_format", "tools"],
          pricing: { prompt: "0.000002", completion: "0.000012", image: "0" },
          pricing_overrides: [],
        },
        {
          provider_name: "Emergency Provider",
          name: `${modelId}:emergency`,
          tag: "other/global",
          status: "active",
          context_length: 1048576,
          supported_parameters: ["structured_outputs", "response_format"],
          pricing: modelId.includes("3.5")
            ? { prompt: "0.0000027", completion: "0.0000162" }
            : { prompt: "0.0000072", completion: "0.0000324" },
          pricing_overrides: modelId.includes("3.5") ? [] : [{ min_prompt_tokens: 200001, pricing: { prompt: "0.0000072", completion: "0.0000324" } }],
        },
      ],
    },
  };
}

function priceSnapshot() {
  return buildPublicPriceSnapshotV4({
    fetchedAt: "2026-07-15T00:00:00.000Z",
    modelsPayload: rawModels,
    endpointPayloads: {
      "google/gemini-3.5-flash": endpointPayload("google/gemini-3.5-flash"),
      "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
    },
  });
}

function schemaExample(schema: JsonObject): unknown {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (schema.type === "object") {
    const properties = schema.properties as JsonObject;
    const required = schema.required as string[];
    return Object.fromEntries(required.map((key) => [key, schemaExample(properties[key] as JsonObject)]));
  }
  if (schema.type === "array") {
    const length = typeof schema.minItems === "number" ? schema.minItems : 0;
    return Array.from({ length }, () => schemaExample(schema.items as JsonObject));
  }
  if (schema.type === "string") return "x".repeat(Math.max(16, typeof schema.minLength === "number" ? schema.minLength : 1));
  if (schema.type === "integer" || schema.type === "number") return typeof schema.minimum === "number" ? schema.minimum : 0;
  if (schema.type === "boolean") return false;
  if (schema.type === "null") return null;
  throw new Error(`unsupported test schema type ${String(schema.type)}`);
}

const validContent = schemaExample(responseSchema) as { questions: JsonObject[] };

function responseRaw(model: string, options: {
  provider?: string;
  questionCount?: number;
  finishReason?: string;
  content?: unknown;
  usage?: JsonObject;
} = {}): string {
  const count = options.questionCount ?? 1;
  const content = options.content ?? { ...validContent, questions: Array.from({ length: count }, () => validContent.questions[0]) };
  return JSON.stringify({
    id: `gen-${sha256V4(model).slice(0, 16)}`,
    model,
    provider: options.provider ?? "Google Vertex",
    choices: [{
      index: 0,
      finish_reason: options.finishReason ?? "stop",
      message: { role: "assistant", content: JSON.stringify(content) },
    }],
    usage: options.usage ?? { prompt_tokens: 100, completion_tokens: 25, total_tokens: 125, cost: 0.01 },
  });
}

function parserInput(rawText: string, expectedProvider = "Google Vertex") {
  return {
    rawText,
    requestedModel: "google/gemini-3.5-flash",
    allowedServedModels: ["google/gemini-3.5-flash", "google/gemini-3.5-flash-20260519"],
    expectedProvider,
    allowedFinishReasons: ["stop"] as const,
    responseSchema,
  };
}

test("protocol is the blocked v4 author freeze", () => {
  assert.equal(protocol.schemaVersion, "question-quality-v6-connectivity-pilot-protocol-v4");
  assert.deepEqual(protocol.authorization, { liveExecutionAuthorized: false, hostileAuditPassed: false, dispatchCommandPresent: false });
});

test("protocol fixes exactly two serial single-shot assignments", () => {
  assert.deepEqual(protocol.durableBounds.assignments.map((row) => row.plan), ["STANDARD", "PREMIUM"]);
  assert.equal(protocol.durableBounds.sharedCandidateCap, 2);
  assert.equal(protocol.durableBounds.sharedPhysicalFetchCap, 2);
  assert.equal(protocol.durableBounds.sharedCompletionCap, 2);
});

test("protocol forbids retry/repair/fallback/replacement/top-up", () => {
  for (const key of ["retryAllowed", "repairAllowed", "fallbackAllowed", "replacementAllowed", "topUpAllowed"] as const) assert.equal(protocol.durableBounds[key], false);
});

test("author freeze records exactly zero external activity and mutation", () => {
  assert(Object.values(protocol.authorFreezeActivity).every((value) => value === 0));
});

test("price snapshot normalizes canonical slugs, all endpoint rates, and exact tag", () => {
  const snapshot = priceSnapshot();
  assert.equal(snapshot.models.length, 2);
  assert(snapshot.models.every((row) => row.endpointRates.length === 2));
  assert(snapshot.models.every((row) => row.endpointRates.filter((endpoint) => endpoint.tag === "google-vertex/global" && endpoint.status === "active").length === 1));
});

test("price snapshot content hash is self-verifying", () => {
  const snapshot = priceSnapshot();
  const core = { ...snapshot } as Record<string, unknown>;
  delete core.contentSha256;
  assert.equal(snapshot.contentSha256, sha256V4(stableJsonV4(core)));
});

test("price snapshot binds all-active emergency maxima including overrides", () => {
  const snapshot = priceSnapshot();
  const premium = priceEvidenceForModelV4(snapshot, "google/gemini-3.1-pro-preview");
  assert.equal(premium.emergencyPromptUsdPer1M, 7.2);
  assert.equal(premium.emergencyCompletionUsdPer1M, 32.4);
});

test("price snapshot rejects duplicate exact active endpoints", () => {
  const payload = endpointPayload("google/gemini-3.5-flash");
  payload.data.endpoints.push({ ...payload.data.endpoints[0]!, name: "duplicate" });
  assert.throws(() => buildPublicPriceSnapshotV4({
    fetchedAt: "2026-07-15T00:00:00.000Z",
    modelsPayload: rawModels,
    endpointPayloads: { "google/gemini-3.5-flash": payload, "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview") },
  }), /exactly one active/u);
});

test("price snapshot rejects tampered content hash", () => {
  const snapshot = { ...priceSnapshot(), contentSha256: "0".repeat(64) };
  assert.throws(() => validatePriceSnapshotV4(snapshot), /contentSha256/u);
});

test("response parser requires final usage, exact route, and one semantic question", () => {
  const parsed = parseConnectivityResponseV4(parserInput(responseRaw("google/gemini-3.5-flash-20260519")));
  assert.equal(parsed.promptTokens, 100);
  assert.match(parsed.parserEvidenceHash, /^[a-f0-9]{64}$/u);
});

test("response parser rejects wrong provider", () => {
  assert.throws(() => parseConnectivityResponseV4(parserInput(
    responseRaw("google/gemini-3.5-flash-20260519", { provider: "Fallback Provider" }),
  )), /provider route/u);
});

test("response parser rejects two semantic questions", () => {
  assert.throws(() => parseConnectivityResponseV4(parserInput(
    responseRaw("google/gemini-3.5-flash-20260519", { questionCount: 2 }),
  )), /array length|exactly one semantic/u);
});

test("response parser rejects truncated length finish reason", () => {
  assert.throws(() => parseConnectivityResponseV4(parserInput(
    responseRaw("google/gemini-3.5-flash-20260519", { finishReason: "length" }),
  )), /terminal non-truncated/u);
});

test("response parser rejects a schema-invalid single object", () => {
  assert.throws(() => parseConnectivityResponseV4(parserInput(
    responseRaw("google/gemini-3.5-flash-20260519", { content: { questions: [{ unexpected: true }] } }),
  )), /exact response schema|required/u);
});

test("response parser rejects fractional token usage", () => {
  assert.throws(() => parseConnectivityResponseV4(parserInput(
    responseRaw("google/gemini-3.5-flash-20260519", {
      usage: { prompt_tokens: 1.5, completion_tokens: 0.5, total_tokens: 2, cost: 0 },
    }),
  )), /safe integer/u);
});

test("response parser requires exact token total consistency", () => {
  assert.throws(() => parseConnectivityResponseV4(parserInput(
    responseRaw("google/gemini-3.5-flash-20260519", {
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 16, cost: 0 },
    }),
  )), /token total is inconsistent/u);
});

test("pure offline scenario completes only Standard then Premium", () => {
  const result = runDeterministicLocalScenarioV4([
    { plan: "STANDARD", rawText: responseRaw("std-canonical"), requestedModel: "std", allowedServedModels: ["std-canonical"], expectedProvider: "Google Vertex", allowedFinishReasons: ["stop"], responseSchema },
    { plan: "PREMIUM", rawText: responseRaw("pro-canonical"), requestedModel: "pro", allowedServedModels: ["pro-canonical"], expectedProvider: "Google Vertex", allowedFinishReasons: ["stop"], responseSchema },
  ]);
  assert.equal(result.terminal, "COMPLETED");
  assert.deepEqual([result.candidateOpportunities, result.physicalFetches, result.completions], [2, 2, 2]);
});

test("pure offline failure is terminal and never reaches Premium", () => {
  const result = runDeterministicLocalScenarioV4(["FAIL_BEFORE_RESPONSE", {
    plan: "PREMIUM", rawText: responseRaw("pro"), requestedModel: "pro", allowedServedModels: ["pro"], expectedProvider: "Google Vertex", allowedFinishReasons: ["stop"], responseSchema,
  }]);
  assert.equal(result.terminal, "FAILED_TERMINAL");
  assert.equal(result.started, 1);
});

test("pure offline unknown-after-send is terminal and consumes one opportunity", () => {
  const result = runDeterministicLocalScenarioV4(["UNKNOWN_AFTER_SEND"]);
  assert.equal(result.terminal, "UNKNOWN_AFTER_SEND_TERMINAL");
  assert.equal(result.candidateOpportunities, 1);
});

test("live entrypoint set is exact, sorted, and versioned v4", () => {
  assert.deepEqual([...LIVE_ENTRYPOINTS_V4], [...LIVE_ENTRYPOINTS_V4].sort());
  assert(LIVE_ENTRYPOINTS_V4.every((entry) => entry.includes("campaign-v6-connectivity-pilot-v4")));
});

test("computed live closure excludes every offline test-support and author tool", () => {
  const closure = computeLiveClosureV4();
  const paths = closure.files.map((row) => row.path);
  assert(!paths.some((entry) => /offline\.test|test-support|verify|build-offline/u.test(entry)));
});

test("computed live closure has exact bytes/hash rows and no minimum-count rule", () => {
  const closure = computeLiveClosureV4();
  for (const row of closure.files) {
    const bytes = readFileSync(path.join(repoRoot, row.path));
    assert.equal(bytes.byteLength, row.bytes);
    assert.equal(sha256V4(bytes), row.sha256);
  }
  assert.equal(closure.completeness.minimumCountAcceptanceUsed, false);
  assert.equal(closure.files.length, 11);
});

test("compiler closure is a complete exact set, not the inherited 32-row subset", () => {
  const closure = computeCompilerClosureV4();
  assert.equal(closure.sourceFiles.length, 192);
  assert.equal(closure.declaredDataInputs.length, 4);
  assert.equal(closure.files.length, 196);
  assert.deepEqual(closure.resolutionEvidence.unresolvedLocalSpecifiers, []);
  assert.deepEqual(closure.resolutionEvidence.nonliteralDynamicLoads, []);
  const v3 = JSON.parse(readFileSync(path.join(here, "../campaign-v6-connectivity-pilot-v3/private/exact-wire-v3.private.json"), "utf8")) as { productionSourceClosure: Array<{ path: string }> };
  assert.equal(v3.productionSourceClosure.length, 32);
  assert.notDeepEqual(v3.productionSourceClosure.map((row) => row.path).sort(), closure.files.map((row) => row.path));
  assert.equal(closure.completeness.minimumCountAcceptanceUsed, false);
  assert.equal(closure.completeness.inheritedThirtyTwoRowSubsetTrustedAsAuthority, false);
});

test("production runner exposes no test/injected/delegate/transport authority", () => {
  const source = readFileSync(path.join(here, "production-runner.ts"), "utf8");
  assert.doesNotMatch(source, /QUESTION_QUALITY_CONNECTIVITY_PILOT_TEST|TEST_MODE|createOffline|InjectedTransport|\bdelegate\b|\bpermit\b/iu);
  assert.deepEqual([...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/gu)].map((match) => match[1]), ["runSealedConnectivityPilotV4"]);
});

test("test support has no network, child-process, env, filesystem, or production-runner import capability", () => {
  const source = readFileSync(path.join(here, "test-support.ts"), "utf8");
  assert.doesNotMatch(source, /from\s+["']node:(?:http|https|net|tls|dns|fs|child_process|worker_threads)["']|process\.env|globalThis\.fetch|\bfetch\s*\(|production-runner/iu);
});

test("operator freeze has no callable CLI dispatch path", () => {
  const source = readFileSync(path.join(here, "operator-wrapper.mts"), "utf8");
  assert.match(source, /No dispatch command is present/u);
  assert.match(source, /authorization\.dispatchCommandPresent !== true/u);
});

test("global ledger remains exactly 0 used, 0 reserved during author tests", () => {
  const ledger = JSON.parse(readFileSync(path.join(repoRoot, "experiments/question-quality-20260715/budget-ledger.json"), "utf8")) as Record<string, unknown>;
  assert.equal(ledger.capFullQuestionCandidates, 1000);
  assert.equal(ledger.usedFullQuestionCandidates, 0);
  assert.equal(ledger.reservedFullQuestionCandidates, 0);
});
