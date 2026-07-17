import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { RunGenerationInput } from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation-types";
import * as profilesModule from "@/lib/question-generation-research-profiles";
import type { QuestionGenerationResearchPromptProfileId } from "@/lib/question-generation-research-profiles";
import * as runtimeModule from "@/lib/question-generation-research-runtime";
import type {
  QuestionGenerationResearchOperation,
  QuestionGenerationResearchRuntime,
  QuestionGenerationResearchStage,
} from "@/lib/question-generation-research-runtime";

const profiles =
  (profilesModule as unknown as { default?: typeof profilesModule }).default ??
  profilesModule;
const runtime =
  (runtimeModule as unknown as { default?: typeof runtimeModule }).default ??
  runtimeModule;
const { runWithQuestionGenerationResearchPromptProfile } = profiles;
const {
  QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY,
  runWithQuestionGenerationResearchRuntime,
} = runtime;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const designDir = path.join(
  repoRoot,
  "experiments/question-quality-20260715/design/campaign-v5-s1",
);
const privateQueuePath = path.join(designDir, "private/s1-queue-v5.json");
const privateOutputPath = path.join(here, "private/controller-preflight-v1.json");
const publicOutputPath = path.join(here, "controller-preflight-v1.json");
const manifestPath = path.join(here, "MANIFEST.sha256");

const EXPECTED_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const EXPECTED_PROVIDER_ROUTING = {
  order: ["google-vertex/global"],
  only: ["google-vertex/global"],
  allow_fallbacks: false,
  require_parameters: true,
  data_collection: "deny",
  zdr: true,
} as const;
const PROFILE_IDS = new Set<string>([
  "G0_CURRENT_CONTROL",
  "G1_FINAL_CHECKLIST_ABLATION",
  "G2_POSITIVE_COMPACT",
  "G3_SITE_CERTIFICATE",
  "B0_CURRENT_CONTROL",
  "B1_TYPE_SCOPED_TAIL",
  "B2_POSITIVE_COMPACT",
  "B3_OPTION_INTENT_LEDGER",
]);

const SOURCE_CLOSURE = [
  ["compiler", "experiments/question-quality-20260715/execution/campaign-v5-s1-controller-v1/compile-controller-preflight.mts"],
  ["verifier", "experiments/question-quality-20260715/execution/campaign-v5-s1-controller-v1/verify-controller-preflight.mts"],
  ["campaign_public", "experiments/question-quality-20260715/design/campaign-v5-s1/campaign-v5-s1.json"],
  ["campaign_manifest", "experiments/question-quality-20260715/design/campaign-v5-s1/MANIFEST.sha256"],
  ["production_fast_callsite", "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts"],
  ["production_trigger_callsite", "src/trigger/workbench-question-generation.ts"],
  ["production_generation_engine", "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts"],
  ["generation_types", "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-types.ts"],
  ["generation_retry", "src/app/api/ai/generate-questions-auto/_lib/generate-with-retry.ts"],
  ["generation_prompts", "src/app/api/ai/generate-questions-auto/_lib/prompts.ts"],
  ["generation_llm", "src/lib/question-generation-llm.ts"],
  ["atlas_entry", "src/lib/atlas-ai.ts"],
  ["assignment_boundary", "src/lib/atlas-production-assignment-fetch-boundary.ts"],
  ["research_boundary", "src/lib/atlas-research-fetch-boundary.ts"],
  ["fetch_scope_coordinator", "src/lib/atlas-fetch-scope-coordinator.ts"],
  ["research_runtime", "src/lib/question-generation-research-runtime.ts"],
  ["research_profiles", "src/lib/question-generation-research-profiles.ts"],
  ["research_schema", "src/lib/question-generation-research-schema.ts"],
  ["ai_question_schemas", "src/lib/question-ai-schemas-mc.ts"],
  ["type_settings_dispatch", "src/lib/question-type-generation-settings/index.ts"],
  ["type_settings_grammar", "src/lib/question-type-generation-settings/grammar.ts"],
  ["type_settings_blank", "src/lib/question-type-generation-settings/blank-inference.ts"],
] as const;

const MANIFEST_FILES = [
  "compile-controller-preflight.mts",
  "verify-controller-preflight.mts",
  "tsconfig.json",
  "README.md",
  "controller-preflight-v1.json",
  "private/.gitignore",
] as const;

type QuestionType = "GRAMMAR_ERROR" | "BLANK_INFERENCE";
type Plan = "STANDARD" | "PREMIUM";
type Difficulty = "INTERMEDIATE" | "KILLER";

interface QueuePassage {
  passageToken: string;
  questionType: QuestionType;
  passageContentExact: string;
  passageUtf8Sha256: string;
}

interface QueueAssignment {
  queueOrdinal: number;
  assignmentId: string;
  assignmentKey: string;
  orderRank: string;
  passageToken: string;
  questionType: QuestionType;
  profileId: string;
  plan: Plan;
  difficulty: Difficulty;
  modelId: string;
  request: {
    plan: RunGenerationInput["plan"];
    schoolType: string;
    gradeInfo: string;
    passageContentRef: string;
    teacherIntentBlock: string;
    analysisContext: string;
    diffLabel: string;
    diffInstruction: string;
    generationPlan: Plan;
    customPrompt: string;
  };
  wireContract: {
    providerRequireParameters: boolean;
    reasoning: { enabled: boolean; effort: string; exclude: boolean };
    questionsMinItems: number;
    questionsMaxItems: number;
    maxOutputTokens: number;
  };
  admission: {
    candidateOpportunityCap: number;
    physicalFetchCap: number;
    fullQuestionSemanticCap: number;
    outerAttempts: number;
    sdkRetries: number;
    qualityMode: string;
    attemptIndex: number;
    perCallUsdCapCents: number;
    debitGlobalCandidateBudgetOnStartedOpportunity: number;
  };
  generationAuthorized: boolean;
}

interface PrivateQueue {
  schemaVersion: string;
  status: string;
  passages: QueuePassage[];
  assignments: QueueAssignment[];
  campaignEligibleAssignments: number;
  generationAuthorized: boolean;
  privateQueueSemanticSha256: string;
}

interface CapturedRequest {
  endpoint: string;
  bodyText: string;
  body: Record<string, unknown>;
}

interface WireRow {
  queueOrdinal: number;
  assignmentId: string;
  assignmentKey: string;
  orderRank: string;
  passageToken: string;
  questionType: QuestionType;
  profileId: string;
  plan: Plan;
  difficulty: Difficulty;
  modelId: string;
  endpoint: string;
  endpointSha256: string;
  requestEnvelopeSha256: string;
  wireBodySha256: string;
  wireBodyUtf8Bytes: number;
  wirePromptSha256: string;
  wireSchemaSha256: string;
  responseFormatType: string;
  maxOutputTokens: number;
  completionCount: number;
  candidateOutputsPerCompletion: number;
  providerRequireParameters: boolean;
  providerRoutingSha256: string;
  providerOnly: string[];
  providerOrder: string[];
  providerAllowFallbacks: boolean;
  providerDataCollection: string;
  providerZdr: boolean;
  reasoning: { enabled: boolean; effort: string; exclude: boolean };
  perCallUsdCapCents: number;
  observedFetches: number;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function fileSha256(filePath: string): string {
  return sha256(readFileSync(filePath));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right, "en")),
  );
}

function maskedStrictFailure(): Response {
  return new Response(
    JSON.stringify({
      error: { message: "Provider returned error", code: 400 },
      usage: {
        prompt_tokens: 1,
        completion_tokens: 0,
        total_tokens: 1,
        cost: 0,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

class CaptureRuntime implements QuestionGenerationResearchRuntime {
  readonly runtimeId = "campaign-v5-s1-offline-wire-compiler";
  readonly retryPolicy = QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY;
  readonly expectedQuestionsPerStructuredCall = 1;

  async runAssignment<T>(fn: () => T | Promise<T>): Promise<T> {
    return fn();
  }

  async runOperation<T>(
    _operation: Readonly<QuestionGenerationResearchOperation>,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    return fn();
  }

  async runStage<T>(
    _stage: Readonly<QuestionGenerationResearchStage>,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    return fn();
  }

  async observeCandidateValues(): Promise<void> {}
  async decideCandidateValue(): Promise<void> {}
}

async function captureWire(
  assignment: QueueAssignment,
  passage: QueuePassage,
): Promise<CapturedRequest> {
  const generationModule = await import(
    "@/app/api/ai/generate-questions-auto/_lib/run-question-generation"
  );
  const generationExports =
    (generationModule as unknown as { default?: typeof generationModule }).default ??
    generationModule;
  const { runQuestionGeneration } = generationExports;
  const generation: RunGenerationInput = {
    plan: assignment.request.plan,
    schoolType: assignment.request.schoolType,
    gradeInfo: assignment.request.gradeInfo,
    passageContent: passage.passageContentExact,
    teacherIntentBlock: assignment.request.teacherIntentBlock,
    analysisContext: assignment.request.analysisContext,
    diffLabel: assignment.request.diffLabel,
    diffInstruction: assignment.request.diffInstruction,
    generationPlan: assignment.request.generationPlan,
    customPrompt: assignment.request.customPrompt,
  };

  const captured: CapturedRequest[] = [];
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const endpoint = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    ).toString();
    const bodyText = init?.body;
    if (endpoint !== EXPECTED_ENDPOINT || typeof bodyText !== "string") {
      throw new Error("offline wire compiler rejected an unexpected fetch");
    }
    captured.push({
      endpoint,
      bodyText,
      body: JSON.parse(bodyText) as Record<string, unknown>,
    });
    return maskedStrictFailure();
  }) as typeof fetch;
  console.log = () => undefined;
  console.warn = () => undefined;
  console.error = () => undefined;
  try {
    const questions = await runWithQuestionGenerationResearchPromptProfile(
      assignment.profileId as QuestionGenerationResearchPromptProfileId,
      () =>
        runWithQuestionGenerationResearchRuntime(new CaptureRuntime(), () =>
          runQuestionGeneration(generation, {
            qualityMode: "strict",
            attemptIndex: 0,
            deadlineAt: Date.now() - 1,
          }),
        ),
    );
    assert.deepEqual(questions, []);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
  assert.equal(captured.length, 1, `${assignment.assignmentId} must compile one fetch`);
  return captured[0]!;
}

function validateQueue(queue: PrivateQueue): void {
  assert.equal(queue.schemaVersion, "question-quality-s1-campaign-v5-private-queue-v1");
  assert.equal(queue.status, "FROZEN_DESIGN_QUEUE_NOT_AUTHORIZED");
  assert.equal(queue.assignments.length, 180);
  assert.equal(queue.passages.length, 12);
  assert.equal(queue.campaignEligibleAssignments, 0);
  assert.equal(queue.generationAuthorized, false);
  assert.equal(new Set(queue.assignments.map((row) => row.assignmentId)).size, 180);
  assert.equal(new Set(queue.assignments.map((row) => row.assignmentKey)).size, 180);
  for (const [index, assignment] of queue.assignments.entries()) {
    assert.equal(assignment.queueOrdinal, index + 1);
    assert.ok(PROFILE_IDS.has(assignment.profileId));
    assert.equal(assignment.generationAuthorized, false);
    assert.equal(assignment.request.passageContentRef, assignment.passageToken);
    assert.equal(assignment.request.plan.length, 1);
    assert.equal(assignment.request.plan[0]?.count, 1);
    assert.deepEqual(assignment.request.plan[0]?.targetPoints, []);
    assert.equal(assignment.request.generationPlan, assignment.plan);
    assert.equal(assignment.request.diffLabel, assignment.difficulty);
    assert.equal(assignment.admission.candidateOpportunityCap, 1);
    assert.equal(assignment.admission.physicalFetchCap, 1);
    assert.equal(assignment.admission.fullQuestionSemanticCap, 1);
    assert.equal(assignment.admission.outerAttempts, 1);
    assert.equal(assignment.admission.sdkRetries, 0);
    assert.equal(assignment.admission.qualityMode, "strict");
    assert.equal(assignment.admission.attemptIndex, 0);
  }
}

function wireRow(
  assignment: QueueAssignment,
  passage: QueuePassage,
  captured: CapturedRequest,
): WireRow {
  const body = captured.body;
  assert.equal(captured.endpoint, EXPECTED_ENDPOINT);
  assert.equal(body.model, assignment.modelId);
  assert.equal(assignment.wireContract.providerRequireParameters, true);
  assert.deepEqual(body.provider, EXPECTED_PROVIDER_ROUTING);
  assert.deepEqual(body.reasoning, assignment.wireContract.reasoning);
  assert.equal(body.plugins, undefined);
  assert.equal(body.models, undefined);

  const responseFormat = body.response_format;
  assert.ok(isRecord(responseFormat));
  assert.equal(responseFormat.type, "json_schema");
  assert.ok(isRecord(responseFormat.json_schema));
  const schema = responseFormat.json_schema.schema;
  assert.ok(isRecord(schema));
  assert.ok(isRecord(schema.properties));
  const questions = schema.properties.questions;
  assert.ok(isRecord(questions));
  assert.equal(questions.minItems, assignment.wireContract.questionsMinItems);
  assert.equal(questions.maxItems, assignment.wireContract.questionsMaxItems);

  const tokenCaps = [body.max_tokens, body.max_completion_tokens, body.max_output_tokens]
    .filter((value): value is number => typeof value === "number");
  assert.deepEqual(tokenCaps, [assignment.wireContract.maxOutputTokens]);
  const completionCount = body.n === undefined ? 1 : Number(body.n);
  assert.equal(completionCount, 1);

  const promptSurface = {
    messages: body.messages ?? null,
    prompt: body.prompt ?? null,
    input: body.input ?? null,
    instructions: body.instructions ?? null,
  };
  const requestEnvelope = {
    profileId: assignment.profileId,
    ...assignment.request,
    passageContentExact: passage.passageContentExact,
  };
  return {
    queueOrdinal: assignment.queueOrdinal,
    assignmentId: assignment.assignmentId,
    assignmentKey: assignment.assignmentKey,
    orderRank: assignment.orderRank,
    passageToken: assignment.passageToken,
    questionType: assignment.questionType,
    profileId: assignment.profileId,
    plan: assignment.plan,
    difficulty: assignment.difficulty,
    modelId: assignment.modelId,
    endpoint: captured.endpoint,
    endpointSha256: sha256(captured.endpoint),
    requestEnvelopeSha256: sha256(stableJson(requestEnvelope)),
    wireBodySha256: sha256(captured.bodyText),
    wireBodyUtf8Bytes: Buffer.byteLength(captured.bodyText, "utf8"),
    wirePromptSha256: sha256(stableJson(promptSurface)),
    wireSchemaSha256: sha256(stableJson(schema)),
    responseFormatType: String(responseFormat.type),
    maxOutputTokens: tokenCaps[0]!,
    completionCount,
    candidateOutputsPerCompletion: Number(questions.maxItems),
    providerRequireParameters: true,
    providerRoutingSha256: sha256(stableJson(body.provider)),
    providerOnly: [...EXPECTED_PROVIDER_ROUTING.only],
    providerOrder: [...EXPECTED_PROVIDER_ROUTING.order],
    providerAllowFallbacks: EXPECTED_PROVIDER_ROUTING.allow_fallbacks,
    providerDataCollection: EXPECTED_PROVIDER_ROUTING.data_collection,
    providerZdr: EXPECTED_PROVIDER_ROUTING.zdr,
    reasoning: assignment.wireContract.reasoning,
    perCallUsdCapCents: assignment.admission.perCallUsdCapCents,
    observedFetches: 1,
  };
}

export async function compileCampaignV5S1ControllerPreflight() {
  const queue = readJson<PrivateQueue>(privateQueuePath);
  validateQueue(queue);
  const passageByToken = new Map(queue.passages.map((row) => [row.passageToken, row]));
  const rows: WireRow[] = [];
  for (const assignment of queue.assignments) {
    const passage = passageByToken.get(assignment.passageToken);
    assert.ok(passage, `${assignment.assignmentId} references an unknown passage`);
    assert.equal(passage.questionType, assignment.questionType);
    assert.equal(sha256(passage.passageContentExact), passage.passageUtf8Sha256);
    rows.push(wireRow(assignment, passage, await captureWire(assignment, passage)));
  }

  assert.equal(rows.length, 180);
  assert.equal(new Set(rows.map((row) => row.wireBodySha256)).size, 180);
  assert.equal(new Set(rows.map((row) => row.requestEnvelopeSha256)).size, 180);
  assert.equal(rows.reduce((sum, row) => sum + row.observedFetches, 0), 180);
  assert.equal(rows.reduce((sum, row) => sum + row.candidateOutputsPerCompletion, 0), 180);

  const sourceClosure = SOURCE_CLOSURE.map(([role, relativePath]) => {
    const filePath = path.join(repoRoot, relativePath);
    return {
      role,
      path: relativePath,
      sha256: fileSha256(filePath),
      bytes: readFileSync(filePath).byteLength,
    };
  });
  const privateCore = {
    schemaVersion: "question-quality-s1-controller-preflight-private-v1",
    status: "OFFLINE_WIRE_COMPILED_EXECUTION_BLOCKED",
    confidentiality:
      "PRIVATE: row identities and exact request digests; never publish or add to git.",
    campaign: {
      publicArtifactSha256: fileSha256(path.join(designDir, "campaign-v5-s1.json")),
      publicManifestSha256: fileSha256(path.join(designDir, "MANIFEST.sha256")),
      privateQueueFileSha256: fileSha256(privateQueuePath),
      privateQueueSemanticSha256: queue.privateQueueSemanticSha256,
    },
    sourceClosure,
    safety: {
      externalNetworkCalls: 0,
      providerCalls: 0,
      apiCandidatesConsumed: 0,
      compiledAssignments: rows.length,
      observedInterceptedFetches: rows.length,
      liveExecutionAuthorized: false,
      pricingAttached: false,
      rightsGateAttached: false,
      privacyGateAttached: false,
    },
    rows,
  };
  const controllerPreflightSemanticSha256 = sha256(stableJson(privateCore));
  const privateArtifact = { ...privateCore, controllerPreflightSemanticSha256 };
  const bodyBytes = rows.map((row) => row.wireBodyUtf8Bytes);
  const publicCore = {
    schemaVersion: "question-quality-s1-controller-preflight-public-v1",
    status: "OFFLINE_WIRE_COMPILED_EXECUTION_BLOCKED",
    campaignPublicArtifactSha256: privateCore.campaign.publicArtifactSha256,
    campaignPrivateQueueFileSha256: privateCore.campaign.privateQueueFileSha256,
    controllerPreflightSemanticSha256,
    sourceClosureSha256: sha256(stableJson(sourceClosure)),
    counts: {
      assignments: rows.length,
      interceptedFetches: rows.length,
      physicalFetchCap: rows.length,
      candidateOpportunityCap: rows.length,
      uniqueWireBodies: new Set(rows.map((row) => row.wireBodySha256)).size,
      byType: countBy(rows.map((row) => row.questionType)),
      byPlan: countBy(rows.map((row) => row.plan)),
      byDifficulty: countBy(rows.map((row) => row.difficulty)),
      byModel: countBy(rows.map((row) => row.modelId)),
      byProfile: countBy(rows.map((row) => row.profileId)),
    },
    wire: {
      endpointSha256: sha256(EXPECTED_ENDPOINT),
      minimumBodyUtf8Bytes: Math.min(...bodyBytes),
      maximumBodyUtf8Bytes: Math.max(...bodyBytes),
      totalBodyUtf8Bytes: bodyBytes.reduce((sum, value) => sum + value, 0),
      strictJsonSchemaRows: rows.filter((row) => row.responseFormatType === "json_schema").length,
      reasoningOffRows: rows.filter(
        (row) =>
          row.reasoning.enabled === false &&
          row.reasoning.effort === "none" &&
          row.reasoning.exclude === true,
      ).length,
      providerRequireParametersRows: rows.filter((row) => row.providerRequireParameters).length,
      providerZdrRows: rows.filter((row) => row.providerZdr).length,
      providerDataCollectionDenyRows: rows.filter(
        (row) => row.providerDataCollection === "deny",
      ).length,
      providerFallbackDisabledRows: rows.filter(
        (row) => row.providerAllowFallbacks === false,
      ).length,
      exactGoogleVertexGlobalOnlyRows: rows.filter(
        (row) =>
          stableJson(row.providerOnly) === stableJson(["google-vertex/global"]) &&
          stableJson(row.providerOrder) === stableJson(["google-vertex/global"]),
      ).length,
    },
    safety: privateCore.safety,
    executionHolds: [
      "local corpus-rights decision",
      "provider privacy and retention decision",
      "limited credential and provider-side hard spend ceiling",
      "fresh maximum allowlisted-provider pricing proof no older than 15 minutes",
      "sealed per-assignment durable controller registries and ledger",
      "fresh independent preflight audit",
    ],
  };
  return {
    privateArtifact,
    publicArtifact: {
      ...publicCore,
      publicArtifactSemanticSha256: sha256(stableJson(publicCore)),
    },
  };
}

async function main(): Promise<void> {
  const result = await compileCampaignV5S1ControllerPreflight();
  const shouldWrite = process.argv.includes("--write");
  if (shouldWrite) {
    writeFileSync(privateOutputPath, `${JSON.stringify(result.privateArtifact, null, 2)}\n`, "utf8");
    writeFileSync(publicOutputPath, `${JSON.stringify(result.publicArtifact, null, 2)}\n`, "utf8");
    const manifest = MANIFEST_FILES.map((relativePath) => {
      const digest = fileSha256(path.join(here, relativePath));
      return `${digest}  ${relativePath.replaceAll("\\", "/")}`;
    });
    writeFileSync(manifestPath, `${manifest.join("\n")}\n`, "utf8");
  }
  process.stdout.write(
    `${JSON.stringify({
      status: result.publicArtifact.status,
      assignments: result.publicArtifact.counts.assignments,
      interceptedFetches: result.publicArtifact.counts.interceptedFetches,
      uniqueWireBodies: result.publicArtifact.counts.uniqueWireBodies,
      externalNetworkCalls: result.publicArtifact.safety.externalNetworkCalls,
      providerCalls: result.publicArtifact.safety.providerCalls,
      apiCandidatesConsumed: result.publicArtifact.safety.apiCandidatesConsumed,
      controllerPreflightSemanticSha256:
        result.publicArtifact.controllerPreflightSemanticSha256,
    }, null, 2)}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
