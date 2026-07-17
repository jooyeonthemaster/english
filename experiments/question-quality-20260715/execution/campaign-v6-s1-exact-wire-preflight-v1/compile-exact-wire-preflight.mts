import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import type { RunGenerationInput } from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation-types";
import type { QuestionGenerationResearchPromptProfileId } from "@/lib/question-generation-research-profiles";
import type {
  QuestionGenerationResearchOperation,
  QuestionGenerationResearchRetryPolicy,
  QuestionGenerationResearchRuntime,
  QuestionGenerationResearchStage,
} from "@/lib/question-generation-research-runtime";

import type {
  PrivateAssignment,
  PrivatePassage,
  PrivateQueue,
} from "../../design/campaign-v6-s1/build.mjs";
import * as materializeModule from "../campaign-v6-s1-durable-controller-v1/materialize";
import type {
  S1ExactWireRow,
  S1MaterializationInput,
  S1ProfileArtifactManifest,
} from "../campaign-v6-s1-durable-controller-v1/materialize";
import * as fixtureModule from "../campaign-v6-s1-durable-controller-v1/build-fixture";

const materializeExports =
  (materializeModule as unknown as { default?: typeof materializeModule }).default ??
  materializeModule;
const fixtureExports =
  (fixtureModule as unknown as { default?: typeof fixtureModule }).default ??
  fixtureModule;
const {
  S1_ASSIGNMENT_COUNT,
  S1_EXACT_ENDPOINT,
  S1_OUTPUT_CAP_BY_TYPE,
  S1_PROVIDER_ROUTING,
  S1_ROOT_STAGE,
  materializeS1Campaign,
} = materializeExports;
const { buildFixtureInput } = fixtureExports;

export const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../../../..");
const designDir = path.join(
  repoRoot,
  "experiments/question-quality-20260715/design/campaign-v6-s1",
);
export const paths = {
  privateQueue: path.join(designDir, "private/s1-queue-v6.json"),
  designPublic: path.join(designDir, "campaign-v6-s1.json"),
  designManifest: path.join(designDir, "MANIFEST.sha256"),
  privateArtifact: path.join(here, "private/exact-wire-preflight-v1.json"),
  publicArtifact: path.join(here, "exact-wire-preflight-v1.json"),
  manifest: path.join(here, "MANIFEST.sha256"),
} as const;

export const MANIFEST_FILES = [
  "README.md",
  "compile-exact-wire-preflight.mts",
  "verify.mts",
  "tsconfig.json",
  "exact-wire-preflight-v1.json",
  "private/.gitignore",
] as const;

const SOURCE_PATHS = [
  ["compiler", "experiments/question-quality-20260715/execution/campaign-v6-s1-exact-wire-preflight-v1/compile-exact-wire-preflight.mts"],
  ["verifier", "experiments/question-quality-20260715/execution/campaign-v6-s1-exact-wire-preflight-v1/verify.mts"],
  ["design_public", "experiments/question-quality-20260715/design/campaign-v6-s1/campaign-v6-s1.json"],
  ["design_manifest", "experiments/question-quality-20260715/design/campaign-v6-s1/MANIFEST.sha256"],
  ["profile_design", "experiments/question-quality-20260715/design/prompt-profiles-v1/manifest.json"],
  ["profile_historical_integration_baseline_results", "experiments/question-quality-20260715/reviews/prompt-profile-integration-audit-v2/results.json"],
  ["profile_historical_integration_baseline_manifest", "experiments/question-quality-20260715/reviews/prompt-profile-integration-audit-v2/MANIFEST.sha256"],
  ["profile_current_negative_evidence_results", "experiments/question-quality-20260715/reviews/prompt-profile-negative-evidence-audit-v1/results.json"],
  ["profile_current_negative_evidence_findings", "experiments/question-quality-20260715/reviews/prompt-profile-negative-evidence-audit-v1/findings.json"],
  ["profile_current_negative_evidence_report", "experiments/question-quality-20260715/reviews/prompt-profile-negative-evidence-audit-v1/AUDIT.md"],
  ["profile_current_negative_evidence_source_closure", "experiments/question-quality-20260715/reviews/prompt-profile-negative-evidence-audit-v1/source-closure.json"],
  ["profile_current_negative_evidence_manifest", "experiments/question-quality-20260715/reviews/prompt-profile-negative-evidence-audit-v1/MANIFEST.sha256"],
  ["difficulty_constants", "src/app/api/ai/generate-questions-auto/_lib/constants.ts"],
  ["production_engine", "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts"],
  ["production_engine_constants", "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts"],
  ["production_engine_helpers", "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-helpers.ts"],
  ["production_types", "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-types.ts"],
  ["production_prompts", "src/app/api/ai/generate-questions-auto/_lib/prompts.ts"],
  ["production_schemas", "src/app/api/ai/generate-questions-auto/_lib/schemas.ts"],
  ["production_retry", "src/app/api/ai/generate-questions-auto/_lib/generate-with-retry.ts"],
  ["generation_wire", "src/lib/question-generation-llm.ts"],
  ["prompt_contract", "src/lib/question-generation-prompt-contract.ts"],
  ["research_profiles", "src/lib/question-generation-research-profiles.ts"],
  ["research_schema", "src/lib/question-generation-research-schema.ts"],
  ["research_runtime", "src/lib/question-generation-research-runtime.ts"],
  ["type_settings_dispatch", "src/lib/question-type-generation-settings/index.ts"],
  ["type_settings_grammar", "src/lib/question-type-generation-settings/grammar.ts"],
  ["type_settings_blank", "src/lib/question-type-generation-settings/blank-inference.ts"],
  ["quality_dispatcher", "src/lib/question-quality/dispatcher.ts"],
  ["quality_core", "src/lib/question-quality/core.ts"],
  ["grammar_quality_shared", "src/lib/question-quality/validators/grammar/shared.ts"],
  ["grammar_quality_combo", "src/lib/question-quality/validators/grammar/combo.ts"],
  ["grammar_quality_marked", "src/lib/question-quality/validators/grammar/marked.ts"],
  ["grammar_explanation_lint", "src/lib/question-quality/validators/grammar/explanation-lint.ts"],
  ["blank_quality_inference", "src/lib/question-quality/validators/blank/inference.ts"],
  ["blank_quality_distractor", "src/lib/question-quality/validators/blank/inference-distractor.ts"],
  ["blank_quality_shared", "src/lib/question-quality/validators/blank/shared.ts"],
  ["blank_quality_paraphrase", "src/lib/question-quality/validators/blank/paraphrase.ts"],
  ["blank_quality_seam", "src/lib/question-quality/validators/blank/seam.ts"],
  ["option_quality", "src/lib/question-quality/validators/options.ts"],
  ["atlas_entry", "src/lib/atlas-ai.ts"],
  ["assignment_budget", "src/lib/question-generation-assignment-budget.ts"],
  ["assignment_budget_policy", "src/lib/question-generation-assignment-budget-policy.ts"],
  ["production_assignment_boundary", "src/lib/atlas-production-assignment-fetch-boundary.ts"],
  ["research_fetch_boundary", "src/lib/atlas-research-fetch-boundary.ts"],
  ["fetch_scope_coordinator", "src/lib/atlas-fetch-scope-coordinator.ts"],
  ["durable_materializer", "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/materialize.ts"],
  ["durable_offline_fixture_builder", "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/build-fixture.ts"],
  ["durable_runtime", "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/runtime.ts"],
  ["durable_parser", "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/openrouter-question-parser.ts"],
  ["durable_manifest", "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/MANIFEST.sha256"],
  ["durable_shared_atlas_controller", "experiments/question-quality-20260715/harness/atlas-controller.ts"],
  ["durable_shared_ledger", "experiments/question-quality-20260715/harness/ledger.ts"],
  ["durable_shared_research_fetch_boundary", "src/lib/atlas-research-fetch-boundary.ts"],
  ["pricing_snapshot_schema_source", "experiments/question-quality-20260715/pricing/snapshot-openrouter-pricing.ts"],
  ["pricing_contract_readme", "experiments/question-quality-20260715/pricing/README.md"],
] as const;

interface CapturedRequest {
  endpoint: string;
  bodyText: string;
  body: Record<string, unknown>;
}

export interface ExactWirePrivateRow extends S1ExactWireRow {
  orderRank: string;
  responseFormatType: "json_schema";
  observedInterceptedFetches: 1;
}

type UnpricedMaterializerBinding = Omit<
  S1MaterializationInput,
  "preflightSemanticSha256" | "preflightArtifactSha256" | "pricing" | "designAuthorization"
> & {
  bindingSchemaVersion: "question-quality-s1-v6-unpriced-materializer-binding-v1";
  status: "BLOCKED_AWAITING_FRESH_SCHEMA_V2_PRICE_AND_AUTHORIZATION";
  requiredAtMaterialization: readonly [
    "preflightSemanticSha256",
    "preflightArtifactSha256",
    "pricing",
    "designAuthorization",
  ];
  requiredBeforeLiveExecution: readonly [
    "dedicatedCredentialAttestation",
    "providerHardLimitAttestation",
    "providerPrivacyReview",
    "independentPreDispatchAudit",
  ];
  designAuthorization: {
    status: "BLOCKED_FIXTURE";
    authorizationRecordHash: null;
  };
  assignments: ExactWirePrivateRow[];
};

const DESIGN_CEILING_USD = 100;
const DESIGN_EXACT_WIRE_BODY_UTF8_BYTES_CEILING = 9_000_000;
const SERVER_TOKEN_OVERHEAD_UPPER_BOUND = 4_096;
const DESIGN_SAFETY_MULTIPLIER = 1.1;
const EMERGENCY_RATES_USD_PER_1M = Object.freeze({
  STANDARD: Object.freeze({ input: 2.7, output: 16.2 }),
  PREMIUM: Object.freeze({ input: 7.2, output: 32.4 }),
});

interface ProductionDependencies {
  runQuestionGeneration: (
    input: RunGenerationInput,
    options: { qualityMode: "strict"; attemptIndex: 0; deadlineAt: number },
  ) => Promise<unknown[]>;
  runWithQuestionGenerationResearchPromptProfile: <T>(
    profileId: QuestionGenerationResearchPromptProfileId,
    fn: () => T | Promise<T>,
  ) => Promise<T>;
  runWithQuestionGenerationResearchRuntime: <T>(
    runtime: QuestionGenerationResearchRuntime,
    fn: () => T | Promise<T>,
  ) => Promise<T>;
  retryPolicy: Readonly<QuestionGenerationResearchRetryPolicy>;
}

interface OfflineTransportGuard {
  beginExpectedFetchCapture(handler: typeof fetch): void;
  endExpectedFetchCapture(): void;
  restore(): void;
  stats(): {
    interceptedFetches: number;
    unexpectedFetchAttempts: number;
    blockedNonFetchTransportAttempts: number;
  };
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function stableValue(value: unknown): unknown {
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

export function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function fileSha256(filePath: string): string {
  return sha256(readFileSync(filePath));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
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

function sourceClosure() {
  return SOURCE_PATHS.map(([role, relativePath]) => {
    const filePath = path.join(repoRoot, relativePath);
    return {
      role,
      path: relativePath,
      sha256: fileSha256(filePath),
      bytes: readFileSync(filePath).byteLength,
    };
  });
}

function artifactHashForRoles(
  closure: ReturnType<typeof sourceClosure>,
  roles: readonly string[],
  extra: Record<string, unknown> = {},
): string {
  const roleSet = new Set(roles);
  const files = closure.filter((row) => roleSet.has(row.role));
  assert.equal(files.length, roleSet.size, `missing artifact role in closure: ${roles.join(",")}`);
  return sha256(stableJson({ files, ...extra }));
}

function gitVersion(sourceClosureSha256: string): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const head = result.stdout.trim();
  assert(/^[a-f0-9]{40}$/u.test(head));
  return `${head}-worktree-${sourceClosureSha256.slice(0, 16)}`;
}

function installSecretFreeOfflineEnvironment(): void {
  const osAllowlist = [
    "PATH",
    "Path",
    "PATHEXT",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "ComSpec",
    "NUMBER_OF_PROCESSORS",
    "PROCESSOR_ARCHITECTURE",
  ] as const;
  const safeInherited: Record<string, string> = {};
  for (const name of osAllowlist) {
    const value = process.env[name];
    if (value !== undefined) safeInherited[name] = value;
  }
  for (const name of Object.keys(process.env)) delete process.env[name];
  Object.assign(process.env, safeInherited);
  Object.assign(process.env, {
    NODE_ENV: "test",
    OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
    OPENROUTER_API_KEY: "offline-wire-capture-non-secret",
    OPENROUTER_STANDARD_MODEL: "google/gemini-3.5-flash",
    PREMIUM_QGEN_MODEL_ID: "google/gemini-3.1-pro-preview",
    OPENROUTER_GEMINI_REASONING_EFFORT: "none",
    OPENROUTER_REASONING_EFFORT: "none",
  });
}

function installFailClosedTransportGuard(): OfflineTransportGuard {
  const require = createRequire(import.meta.url);
  const http = require("node:http") as typeof import("node:http");
  const https = require("node:https") as typeof import("node:https");
  const net = require("node:net") as typeof import("node:net");
  const tls = require("node:tls") as typeof import("node:tls");
  const originalFetch = globalThis.fetch;
  const originals = {
    httpRequest: http.request,
    httpGet: http.get,
    httpsRequest: https.request,
    httpsGet: https.get,
    netConnect: net.connect,
    netCreateConnection: net.createConnection,
    tlsConnect: tls.connect,
  };
  let expectedFetchHandler: typeof fetch | null = null;
  let interceptedFetches = 0;
  let unexpectedFetchAttempts = 0;
  let blockedNonFetchTransportAttempts = 0;
  const blockNonFetch = (..._args: unknown[]): never => {
    blockedNonFetchTransportAttempts += 1;
    throw new Error("offline exact-wire compiler blocked a non-fetch network transport");
  };
  http.request = blockNonFetch as typeof http.request;
  http.get = blockNonFetch as typeof http.get;
  https.request = blockNonFetch as typeof https.request;
  https.get = blockNonFetch as typeof https.get;
  net.connect = blockNonFetch as typeof net.connect;
  net.createConnection = blockNonFetch as typeof net.createConnection;
  tls.connect = blockNonFetch as typeof tls.connect;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!expectedFetchHandler) {
      unexpectedFetchAttempts += 1;
      throw new Error("offline exact-wire compiler blocked an out-of-window fetch");
    }
    interceptedFetches += 1;
    return expectedFetchHandler(input, init);
  }) as typeof fetch;
  return {
    beginExpectedFetchCapture(handler) {
      assert.equal(expectedFetchHandler, null, "nested expected fetch capture window");
      expectedFetchHandler = handler;
    },
    endExpectedFetchCapture() {
      expectedFetchHandler = null;
    },
    restore() {
      expectedFetchHandler = null;
      globalThis.fetch = originalFetch;
      http.request = originals.httpRequest;
      http.get = originals.httpGet;
      https.request = originals.httpsRequest;
      https.get = originals.httpsGet;
      net.connect = originals.netConnect;
      net.createConnection = originals.netCreateConnection;
      tls.connect = originals.tlsConnect;
    },
    stats() {
      return {
        interceptedFetches,
        unexpectedFetchAttempts,
        blockedNonFetchTransportAttempts,
      };
    },
  };
}

async function loadProductionDependencies(): Promise<ProductionDependencies> {
  const [generationModule, profilesModule, runtimeModule] = await Promise.all([
    import("@/app/api/ai/generate-questions-auto/_lib/run-question-generation"),
    import("@/lib/question-generation-research-profiles"),
    import("@/lib/question-generation-research-runtime"),
  ]);
  const generation =
    (generationModule as unknown as { default?: typeof generationModule }).default ??
    generationModule;
  const profiles =
    (profilesModule as unknown as { default?: typeof profilesModule }).default ??
    profilesModule;
  const runtime =
    (runtimeModule as unknown as { default?: typeof runtimeModule }).default ??
    runtimeModule;
  return {
    runQuestionGeneration: generation.runQuestionGeneration,
    runWithQuestionGenerationResearchPromptProfile:
      profiles.runWithQuestionGenerationResearchPromptProfile,
    runWithQuestionGenerationResearchRuntime:
      runtime.runWithQuestionGenerationResearchRuntime,
    retryPolicy: runtime.QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY,
  };
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
  readonly runtimeId = "campaign-v6-s1-offline-exact-wire-compiler";
  readonly expectedQuestionsPerStructuredCall = 1;

  constructor(readonly retryPolicy: Readonly<QuestionGenerationResearchRetryPolicy>) {}

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
  assignment: PrivateAssignment,
  passage: PrivatePassage,
  dependencies: ProductionDependencies,
  transportGuard: OfflineTransportGuard,
): Promise<CapturedRequest> {
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
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  transportGuard.beginExpectedFetchCapture(async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const endpoint = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    ).toString();
    const bodyText = init?.body;
    assert.equal(endpoint, S1_EXACT_ENDPOINT, "unexpected endpoint in offline compiler");
    assert(typeof bodyText === "string", "offline compiler requires a string body");
    captured.push({
      endpoint,
      bodyText,
      body: JSON.parse(bodyText) as Record<string, unknown>,
    });
    return maskedStrictFailure();
  });
  console.log = () => undefined;
  console.warn = () => undefined;
  console.error = () => undefined;
  try {
    const questions = await dependencies.runWithQuestionGenerationResearchPromptProfile(
      assignment.profileId as QuestionGenerationResearchPromptProfileId,
      () =>
        dependencies.runWithQuestionGenerationResearchRuntime(
          new CaptureRuntime(dependencies.retryPolicy),
          () => dependencies.runQuestionGeneration(generation, {
            qualityMode: "strict",
            attemptIndex: 0,
            deadlineAt: Date.now() - 1,
          }),
        ),
    );
    assert.deepEqual(questions, []);
  } finally {
    transportGuard.endExpectedFetchCapture();
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
  assert.equal(captured.length, 1, `${assignment.assignmentId}: expected exactly one captured fetch`);
  return captured[0];
}

function validateQueue(queue: PrivateQueue): void {
  assert.equal(queue.schemaVersion, "question-quality-s1-campaign-v6-private-queue-v1");
  assert.equal(queue.status, "IMMUTABLE_QUEUE_EXECUTION_BLOCKED");
  assert.equal(queue.assignments.length, S1_ASSIGNMENT_COUNT);
  assert.equal(queue.passages.length, 12);
  assert.equal(queue.campaignEligibleAssignments, 0);
  assert.equal(queue.generationAuthorized, false);
  assert.equal(new Set(queue.assignments.map((row) => row.assignmentId)).size, 180);
  assert.equal(new Set(queue.assignments.map((row) => row.assignmentKey)).size, 180);
  for (const [index, row] of queue.assignments.entries()) {
    assert.equal(row.queueOrdinal, index + 1);
    assert.equal(row.generationAuthorized, false);
    assert.equal(row.campaignEligible, false);
    assert.equal(row.request.passageContentRef, row.passageToken);
    assert.equal(row.request.plan.length, 1);
    assert.equal(row.request.plan[0]?.count, 1);
    assert.deepEqual(row.request.plan[0]?.targetPoints, []);
    assert.equal(row.request.generationPlan, row.plan);
    assert.equal(row.request.diffLabel, row.difficulty);
    assert.equal(row.admission.candidateOpportunityCap, 1);
    assert.equal(row.admission.physicalFetchCap, 1);
    assert.equal(row.admission.fullQuestionSemanticCap, 1);
    assert.equal(row.admission.outerAttempts, 1);
    assert.equal(row.admission.sdkRetries, 0);
    assert.equal(row.admission.pricingAttached, false);
  }
}

function wireRow(
  assignment: PrivateAssignment,
  passage: PrivatePassage,
  captured: CapturedRequest,
  artifacts: {
    promptProfileArtifactHash: string;
    gateArtifactHash: string;
    policyArtifactHash: string;
    gitVersion: string;
  },
): ExactWirePrivateRow {
  const body = captured.body;
  assert.equal(captured.endpoint, S1_EXACT_ENDPOINT);
  assert.equal(body.model, assignment.modelId);
  assert.deepEqual(body.provider, S1_PROVIDER_ROUTING);
  assert.deepEqual(body.reasoning, { enabled: false, effort: "none", exclude: true });
  assert.equal(body.plugins, undefined);
  assert.equal(body.models, undefined);

  const responseFormat = body.response_format;
  assert(isRecord(responseFormat));
  assert.equal(responseFormat.type, "json_schema");
  assert(isRecord(responseFormat.json_schema));
  const schema = responseFormat.json_schema.schema;
  assert(isRecord(schema));
  assert(isRecord(schema.properties));
  const questions = schema.properties.questions;
  assert(isRecord(questions));
  assert.equal(questions.minItems, 1);
  assert.equal(questions.maxItems, 1);

  const tokenCaps = [body.max_tokens, body.max_completion_tokens, body.max_output_tokens]
    .filter((value): value is number => typeof value === "number");
  assert.deepEqual(tokenCaps, [S1_OUTPUT_CAP_BY_TYPE[assignment.questionType]]);
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
    endpoint: S1_EXACT_ENDPOINT,
    endpointSha256: sha256(S1_EXACT_ENDPOINT),
    requestEnvelopeSha256: sha256(stableJson(requestEnvelope)),
    wireBodySha256: sha256(captured.bodyText),
    wireBodyUtf8Bytes: Buffer.byteLength(captured.bodyText, "utf8"),
    wirePromptSha256: sha256(stableJson(promptSurface)),
    wireSchemaSha256: sha256(stableJson(schema)),
    maxOutputTokens: tokenCaps[0],
    completionCount: 1,
    candidateOutputsPerCompletion: 1,
    providerRouting: S1_PROVIDER_ROUTING,
    providerRoutingSha256: sha256(stableJson(S1_PROVIDER_ROUTING)),
    reasoning: { enabled: false, effort: "none", exclude: true },
    rootStage: S1_ROOT_STAGE,
    promptProfileArtifactHash: artifacts.promptProfileArtifactHash,
    gateArtifactHash: artifacts.gateArtifactHash,
    policyArtifactHash: artifacts.policyArtifactHash,
    runnerVersion: "campaign-v6-s1-exact-wire-preflight-v1",
    gitVersion: artifacts.gitVersion,
    rights: {
      rightsRecordHash: passage.rights.rightsRecordHash,
      authorship: "CAMPAIGN_ORIGINAL",
      externalModelProcessingAuthorized: true,
      piiReview: "NO_PII_FOUND",
      passageUtf8Sha256: passage.passageUtf8Sha256,
    },
    responseFormatType: "json_schema",
    observedInterceptedFetches: 1,
  };
}

function buildProfileArtifactManifest(
  rows: readonly ExactWirePrivateRow[],
): S1ProfileArtifactManifest {
  const profilePairs = [...new Set(rows.map((row) => row.profileId))]
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .map((profileId) => {
      const hashes = [
        ...new Set(
          rows
            .filter((row) => row.profileId === profileId)
            .map((row) => row.promptProfileArtifactHash),
        ),
      ];
      assert.equal(hashes.length, 1, `${profileId}: one immutable artifact hash`);
      return [profileId, hashes[0]] as const;
    });
  assert.equal(profilePairs.length, 8, "exactly eight treatment profile artifacts");
  assert.equal(
    new Set(profilePairs.map(([, artifactHash]) => artifactHash)).size,
    8,
    "profile aliases are forbidden",
  );
  const material = {
    schemaVersion: "question-quality-s1-v6-profile-artifact-manifest-v1" as const,
    aliasesAllowed: false as const,
    profiles: Object.fromEntries(profilePairs) as S1ProfileArtifactManifest["profiles"],
  };
  return { ...material, manifestSha256: sha256(stableJson(material)) };
}

export async function compileCampaignV6S1ExactWirePreflight() {
  installSecretFreeOfflineEnvironment();
  const transportGuard = installFailClosedTransportGuard();
  try {
    const dependencies = await loadProductionDependencies();
    const queue = readJson<PrivateQueue>(paths.privateQueue);
    validateQueue(queue);
    const closure = sourceClosure();
    const closureHash = sha256(stableJson(closure));
    const negativeProfileAuditResultsPath = path.join(
      repoRoot,
      "experiments/question-quality-20260715/reviews/prompt-profile-negative-evidence-audit-v1/results.json",
    );
    const negativeProfileAudit = readJson<Record<string, unknown>>(
      negativeProfileAuditResultsPath,
    );
    assert.equal(negativeProfileAudit.schemaVersion, 1);
    assert.equal(negativeProfileAudit.verdict, "PASS_REMEDIATED_OFFLINE");
    assert.deepEqual(negativeProfileAudit.sideEffects, {
      externalApiCalls: 0,
      networkCalls: 0,
      applicationDatabaseReads: 0,
      applicationDatabaseWrites: 0,
      candidatesConsumed: 0,
      secretsRead: 0,
    });
    const currentProfileEvidenceClosureSha256 = artifactHashForRoles(closure, [
      "profile_current_negative_evidence_results",
      "profile_current_negative_evidence_findings",
      "profile_current_negative_evidence_report",
      "profile_current_negative_evidence_source_closure",
      "profile_current_negative_evidence_manifest",
    ]);
    const durableBindingSourceClosureSha256 = artifactHashForRoles(closure, [
      "durable_materializer",
      "durable_offline_fixture_builder",
      "durable_runtime",
      "durable_parser",
      "durable_manifest",
      "durable_shared_atlas_controller",
      "durable_shared_ledger",
      "durable_shared_research_fetch_boundary",
      "pricing_snapshot_schema_source",
      "pricing_contract_readme",
    ]);
    const version = gitVersion(closureHash);
    const policyArtifactHash = artifactHashForRoles(closure, [
    "production_engine",
    "production_engine_constants",
    "production_engine_helpers",
    "production_retry",
    "generation_wire",
    "atlas_entry",
    "assignment_budget",
    "assignment_budget_policy",
    "production_assignment_boundary",
    "research_fetch_boundary",
    "fetch_scope_coordinator",
    "research_runtime",
    ]);
    const passageByToken = new Map(queue.passages.map((row) => [row.passageToken, row]));
    const rows: ExactWirePrivateRow[] = [];
    for (const assignment of queue.assignments) {
    const passage = passageByToken.get(assignment.passageToken);
    assert(passage, `${assignment.assignmentId}: unknown passage token`);
    assert.equal(passage.questionType, assignment.questionType);
    assert.equal(sha256(passage.passageContentExact), passage.passageUtf8Sha256);
    const promptProfileArtifactHash = artifactHashForRoles(
      closure,
      [
        "profile_design",
        "profile_historical_integration_baseline_results",
        "profile_historical_integration_baseline_manifest",
        "profile_current_negative_evidence_results",
        "profile_current_negative_evidence_findings",
        "profile_current_negative_evidence_report",
        "profile_current_negative_evidence_source_closure",
        "profile_current_negative_evidence_manifest",
        "research_profiles",
        "research_schema",
        "prompt_contract",
        "production_prompts",
      ],
      { profileId: assignment.profileId },
    );
    const gateArtifactHash = assignment.questionType === "GRAMMAR_ERROR"
      ? artifactHashForRoles(closure, [
          "quality_dispatcher",
          "quality_core",
          "grammar_quality_shared",
          "grammar_quality_combo",
          "grammar_quality_marked",
          "grammar_explanation_lint",
          "type_settings_grammar",
        ])
      : artifactHashForRoles(closure, [
          "quality_dispatcher",
          "quality_core",
          "blank_quality_inference",
          "blank_quality_distractor",
          "blank_quality_shared",
          "blank_quality_paraphrase",
          "blank_quality_seam",
          "option_quality",
          "type_settings_blank",
        ]);
      rows.push(wireRow(
        assignment,
        passage,
        await captureWire(assignment, passage, dependencies, transportGuard),
        { promptProfileArtifactHash, gateArtifactHash, policyArtifactHash, gitVersion: version },
      ));
    }

    const durableRows: S1ExactWireRow[] = rows;
    assert.equal(durableRows.length, S1_ASSIGNMENT_COUNT);
    assert.equal(new Set(rows.map((row) => row.wireBodySha256)).size, 180);
    assert.equal(new Set(rows.map((row) => row.requestEnvelopeSha256)).size, 180);
    assert.equal(rows.reduce((sum, row) => sum + row.observedInterceptedFetches, 0), 180);
    assert.equal(rows.reduce((sum, row) => sum + row.candidateOutputsPerCompletion, 0), 180);
    const profileArtifactManifest = buildProfileArtifactManifest(rows);
    for (const row of rows) {
      assert.equal(
        row.promptProfileArtifactHash,
        profileArtifactManifest.profiles[row.profileId],
        `${row.assignmentId}: row/profile manifest hash binding`,
      );
    }
    const transportStats = transportGuard.stats();
    assert.deepEqual(transportStats, {
      interceptedFetches: 180,
      unexpectedFetchAttempts: 0,
      blockedNonFetchTransportAttempts: 0,
    });
    const totalBodyBytes = rows.reduce((sum, row) => sum + row.wireBodyUtf8Bytes, 0);
    const totalOutputTokens = rows.reduce((sum, row) => sum + row.maxOutputTokens, 0);
    const bodyBytesByPlan = Object.fromEntries(
      (["STANDARD", "PREMIUM"] as const).map((plan) => [
        plan,
        rows
          .filter((row) => row.plan === plan)
          .reduce((sum, row) => sum + row.wireBodyUtf8Bytes, 0),
      ]),
    ) as Record<"STANDARD" | "PREMIUM", number>;
    const outputTokensByPlan = Object.fromEntries(
      (["STANDARD", "PREMIUM"] as const).map((plan) => [
        plan,
        rows
          .filter((row) => row.plan === plan)
          .reduce((sum, row) => sum + row.maxOutputTokens, 0),
      ]),
    ) as Record<"STANDARD" | "PREMIUM", number>;
    assert.deepEqual(outputTokensByPlan, { STANDARD: 480_000, PREMIUM: 432_000 });
    assert.equal(totalOutputTokens, 912_000);
    assert(
      totalBodyBytes <= DESIGN_EXACT_WIRE_BODY_UTF8_BYTES_CEILING,
      "exact bodies exceed preregistered design byte ceiling",
    );
    const illustrativeMaximumUsd = Math.ceil(
      DESIGN_SAFETY_MULTIPLIER *
        (
          (bodyBytesByPlan.STANDARD + 96 * SERVER_TOKEN_OVERHEAD_UPPER_BOUND) *
            EMERGENCY_RATES_USD_PER_1M.STANDARD.input +
          outputTokensByPlan.STANDARD * EMERGENCY_RATES_USD_PER_1M.STANDARD.output +
          (bodyBytesByPlan.PREMIUM + 84 * SERVER_TOKEN_OVERHEAD_UPPER_BOUND) *
            EMERGENCY_RATES_USD_PER_1M.PREMIUM.input +
          outputTokensByPlan.PREMIUM * EMERGENCY_RATES_USD_PER_1M.PREMIUM.output
        ) /
        1_000_000 *
        1e9,
    ) / 1e9;
    assert(
      illustrativeMaximumUsd <= DESIGN_CEILING_USD,
      "offline mixed-model arithmetic exceeds design ceiling",
    );

  const unpricedBinding: UnpricedMaterializerBinding = {
    bindingSchemaVersion: "question-quality-s1-v6-unpriced-materializer-binding-v1",
    status: "BLOCKED_AWAITING_FRESH_SCHEMA_V2_PRICE_AND_AUTHORIZATION",
    requiredAtMaterialization: [
      "preflightSemanticSha256",
      "preflightArtifactSha256",
      "pricing",
      "designAuthorization",
    ],
    requiredBeforeLiveExecution: [
      "dedicatedCredentialAttestation",
      "providerHardLimitAttestation",
      "providerPrivacyReview",
      "independentPreDispatchAudit",
    ],
    schemaVersion: "question-quality-s1-v6-materializer-input-v1.2",
    experimentId: "question-quality-20260715",
    phaseId: "s1-v6",
    batchId: "s1-v6-180",
    campaignId: "question-quality-20260715-s1-v6",
    parser: {
      attestationId: "s1v6-openrouter-question-parser-v1",
      parserArtifactHash: fileSha256(path.join(
        repoRoot,
        "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/openrouter-question-parser.ts",
      )),
    },
    profileArtifactManifest,
    designAuthorization: {
      status: "BLOCKED_FIXTURE",
      authorizationRecordHash: null,
    },
    assignments: rows,
  };

    const fixtureInput = buildFixtureInput();
    const semanticDryInput: S1MaterializationInput = {
      schemaVersion: unpricedBinding.schemaVersion,
      experimentId: unpricedBinding.experimentId,
      phaseId: unpricedBinding.phaseId,
      batchId: unpricedBinding.batchId,
      campaignId: unpricedBinding.campaignId,
      preflightSemanticSha256: sha256(stableJson({ kind: "semantic-dry", rows })),
      preflightArtifactSha256: sha256(stableJson({ kind: "semantic-dry-artifact", rows })),
      parser: unpricedBinding.parser,
      profileArtifactManifest: unpricedBinding.profileArtifactManifest,
      pricing: fixtureInput.pricing,
      designAuthorization: unpricedBinding.designAuthorization,
      assignments: durableRows,
    };
    const semanticDryBundle = materializeS1Campaign(semanticDryInput);
    assert.equal(semanticDryBundle.status, "DRY_RUN_ONLY_EXECUTION_BLOCKED");
    assert.equal(semanticDryBundle.assignments.length, S1_ASSIGNMENT_COUNT);
    assert.equal(semanticDryBundle.globalEnvelope.candidateOpportunityCap, 180);
    assert.equal(semanticDryBundle.globalEnvelope.physicalFetchCap, 180);
    assert(semanticDryBundle.globalEnvelope.maxCostUsd >= illustrativeMaximumUsd);
    assert(
      semanticDryBundle.globalEnvelope.maxCostUsd - illustrativeMaximumUsd <= 180e-9,
      "per-assignment ceiling accumulation exceeded the maximum rounding delta",
    );
    assert(semanticDryBundle.globalEnvelope.maxCostUsd <= DESIGN_CEILING_USD);
    assert.deepEqual(
      semanticDryBundle.profileArtifactManifest,
      profileArtifactManifest,
      "durable bundle preserves the profile artifact manifest",
    );
    const syntheticSnapshot = fixtureInput.pricing.snapshot as {
      schemaVersion: number;
      chargeDimensions: Record<string, string>;
      models: Array<{
        id: string;
        canonicalSlug: string;
        endpointRates: Array<{ provider: string; tag: string; status: string }>;
      }>;
    };
    assert.equal(syntheticSnapshot.schemaVersion, 2);
    assert.deepEqual(syntheticSnapshot.chargeDimensions, {
      textInputTokens: "MODELED_BY_PROMPT_RATE",
      textOutputTokens: "MODELED_BY_COMPLETION_RATE",
      cachedInputTokens: "INAPPLICABLE_NO_CACHE",
      reasoningTokens: "INAPPLICABLE_REASONING_DISABLED",
      imageTokens: "INAPPLICABLE_TEXT_ONLY",
      webSearch: "INAPPLICABLE_NO_WEB_PLUGIN",
      fixedRequestFees: "NONE",
      unknownDimensions: "REJECT",
    });
    const syntheticPricingBindings = syntheticSnapshot.models
      .map((model) => {
        const exactRoutes = model.endpointRates.filter(
          (endpoint) =>
            endpoint.status === "active" && endpoint.tag === "google-vertex/global",
        );
        assert.equal(exactRoutes.length, 1, `${model.id}: one exact active route`);
        assert.equal(exactRoutes[0]?.provider, "Google");
        const servedAllowlist = [model.id, model.canonicalSlug].sort((left, right) =>
          left < right ? -1 : left > right ? 1 : 0,
        );
        return {
          modelId: model.id,
          canonicalSlug: model.canonicalSlug,
          exactRouteProvider: exactRoutes[0]!.provider,
          servedModelAllowlistHash: sha256(stableJson(servedAllowlist)),
        };
      })
      .sort((left, right) =>
        left.modelId < right.modelId ? -1 : left.modelId > right.modelId ? 1 : 0,
      );
    assert.deepEqual(
      syntheticPricingBindings.map(({ modelId, canonicalSlug, exactRouteProvider }) => ({
        modelId,
        canonicalSlug,
        exactRouteProvider,
      })),
      [
        {
          modelId: "google/gemini-3.1-pro-preview",
          canonicalSlug: "google/gemini-3.1-pro-preview-20260219",
          exactRouteProvider: "Google",
        },
        {
          modelId: "google/gemini-3.5-flash",
          canonicalSlug: "google/gemini-3.5-flash-20260519",
          exactRouteProvider: "Google",
        },
      ],
    );
    const conservativeMaximumUsd = semanticDryBundle.globalEnvelope.maxCostUsd;

  const claimBoundary = {
    provenSurface: "OFFLINE_PRODUCTION_CORE_REQUEST_CONSTRUCTION_REPLAY",
    candidateTopology: "DIRECT_SINGLE_DISPATCH_SINGLE_CANDIDATE_MECHANISM_SCREEN",
    productionCoreWireRootReplayed: true,
    fullProductionTopologyParityClaimed: false,
    premiumGrammarLadderPolicyParityClaimed: false,
    productionRetryRepairFallbackPolicyParityClaimed: false,
    productionQualityParityClaimed: false,
    parityRequiresSeparateVersionedTopologyAudit: true,
  } as const;

  const privateCore = {
    schemaVersion: "question-quality-s1-v6-exact-wire-preflight-private-v1",
    status: "OFFLINE_PRODUCTION_CORE_REPLAY_EXECUTION_BLOCKED",
    confidentiality:
      "PRIVATE_GIT_IGNORED: exact row membership and row-level wire/request commitments.",
    campaign: {
      designPublicArtifactSha256: fileSha256(paths.designPublic),
      designManifestSha256: fileSha256(paths.designManifest),
      privateQueueFileSha256: fileSha256(paths.privateQueue),
      privateQueueSemanticSha256: queue.privateQueueSemanticSha256,
    },
    sourceClosure: closure,
    sourceClosureSha256: closureHash,
    profileEvidence: {
      historicalIntegrationAuditRole: "HISTORICAL_BASELINE_ONLY",
      currentNegativeEvidenceAuditVerdict: String(negativeProfileAudit.verdict),
      currentNegativeEvidenceClosureSha256: currentProfileEvidenceClosureSha256,
      currentNegativeEvidenceResultsSha256: fileSha256(negativeProfileAuditResultsPath),
      liveQualityImprovementClaimed: false,
    },
    claimBoundary,
    environmentIsolation: {
      inheritedSecretValuesRead: 0,
      inheritedNonSecretOsAllowlistOnly: [
        "PATH",
        "Path",
        "PATHEXT",
        "SystemRoot",
        "WINDIR",
        "TEMP",
        "TMP",
        "ComSpec",
        "NUMBER_OF_PROCESSORS",
        "PROCESSOR_ARCHITECTURE",
      ],
      everyOtherInheritedEnvironmentNameDeletedWithoutReadingItsValue: true,
      nonSecretDummyCredentialInstalled: true,
      productionModulesImportedAfterIsolation: true,
      failClosedTransportGuardInstalledBeforeProductionModuleImport: true,
      guardedTransports: [
        "globalThis.fetch",
        "node:http.request/get",
        "node:https.request/get",
        "node:net.connect/createConnection",
        "node:tls.connect",
      ],
    },
    safety: {
      externalNetworkCalls: 0,
      providerCalls: 0,
      modelCalls: 0,
      databaseCalls: 0,
      realSecretReads: 0,
      apiCandidatesConsumed: 0,
      compiledAssignments: 180,
      locallyInterceptedFetches: transportStats.interceptedFetches,
      unexpectedFetchAttempts: transportStats.unexpectedFetchAttempts,
      blockedNonFetchTransportAttempts: transportStats.blockedNonFetchTransportAttempts,
      liveExecutionAuthorized: false,
      corpusRightsPiiScopeAttached: true,
      routePrivacyRequestAttached: true,
      independentProviderPrivacyReviewAttached: false,
      pricingAttached: false,
      dedicatedCredentialAttached: false,
    },
    durableControllerSemanticDryValidation: {
      performed: true,
      syntheticFixturePricingOnly: true,
      syntheticFixturePricingIsExecutionAuthority: false,
      materializerStatus: semanticDryBundle.status,
      materializedAssignments: semanticDryBundle.assignments.length,
      candidateOpportunityCap: semanticDryBundle.globalEnvelope.candidateOpportunityCap,
      physicalFetchCap: semanticDryBundle.globalEnvelope.physicalFetchCap,
      conservativeMaxCostUsd: semanticDryBundle.globalEnvelope.maxCostUsd,
      materializedCampaignSemanticSha256: semanticDryBundle.campaignSemanticSha256,
      syntheticPricingSnapshotSha256: fixtureInput.pricing.expectedSnapshotSha256,
      syntheticPricingSchemaVersion: syntheticSnapshot.schemaVersion,
      syntheticPricingBindings,
      profileArtifactManifestSha256: profileArtifactManifest.manifestSha256,
      uniqueProfileArtifactHashes: new Set(Object.values(profileArtifactManifest.profiles)).size,
      durableBindingSourceClosureSha256,
      externalNetworkCalls: semanticDryBundle.safety.externalNetworkCallsDuringMaterialization,
      providerCalls: semanticDryBundle.safety.providerCallsDuringMaterialization,
      apiCandidatesConsumed: semanticDryBundle.safety.apiCandidatesConsumedDuringMaterialization,
    },
    durableControllerUnpricedBinding: unpricedBinding,
  } as const;
  const preflightSemanticSha256 = sha256(stableJson(privateCore));
  const privateArtifact = { ...privateCore, preflightSemanticSha256 };
  const privateBytes = `${JSON.stringify(privateArtifact, null, 2)}\n`;
  const publicCore = {
    schemaVersion: "question-quality-s1-v6-exact-wire-preflight-public-v1",
    status: "OFFLINE_PRODUCTION_CORE_REPLAY_EXECUTION_BLOCKED",
    campaignPublicArtifactSha256: privateCore.campaign.designPublicArtifactSha256,
    campaignPrivateQueueFileSha256: privateCore.campaign.privateQueueFileSha256,
    privatePreflightArtifactSha256: sha256(privateBytes),
    preflightSemanticSha256,
    sourceClosureSha256: closureHash,
    profileEvidence: privateCore.profileEvidence,
    claimBoundary,
    counts: {
      assignments: rows.length,
      locallyInterceptedFetches: 180,
      externalNetworkCalls: 0,
      physicalFetchCap: 180,
      candidateOpportunityCap: 180,
      uniqueWireBodies: new Set(rows.map((row) => row.wireBodySha256)).size,
      uniqueRequestEnvelopes: new Set(rows.map((row) => row.requestEnvelopeSha256)).size,
      byType: countBy(rows.map((row) => row.questionType)),
      byPlan: countBy(rows.map((row) => row.plan)),
      byDifficulty: countBy(rows.map((row) => row.difficulty)),
      byModel: countBy(rows.map((row) => row.modelId)),
      byProfile: countBy(rows.map((row) => row.profileId)),
      b1PremiumAssignments: rows.filter(
        (row) => row.profileId === "B1_TYPE_SCOPED_TAIL" && row.plan === "PREMIUM",
      ).length,
    },
    wire: {
      endpointSha256: sha256(S1_EXACT_ENDPOINT),
      providerRoutingSha256: sha256(stableJson(S1_PROVIDER_ROUTING)),
      totalBodyUtf8Bytes: totalBodyBytes,
      totalBodyUtf8BytesDesignCeiling: DESIGN_EXACT_WIRE_BODY_UTF8_BYTES_CEILING,
      totalOutputTokens,
      profileArtifactSetSha256: sha256(stableJson(
        [...new Set(rows.map((row) => row.promptProfileArtifactHash))].sort(),
      )),
      profileArtifactManifestSha256: profileArtifactManifest.manifestSha256,
      schemaArtifactSetSha256: sha256(stableJson(
        [...new Set(rows.map((row) => row.wireSchemaSha256))].sort(),
      )),
      gateArtifactSetSha256: sha256(stableJson(
        [...new Set(rows.map((row) => row.gateArtifactHash))].sort(),
      )),
      policyArtifactSetSha256: sha256(stableJson(
        [...new Set(rows.map((row) => row.policyArtifactHash))].sort(),
      )),
      rightsAndPiiRecordSetSha256: sha256(stableJson(
        [...new Set(rows.map((row) => stableJson(row.rights)))].sort(),
      )),
      strictJsonSchemaRows: rows.filter((row) => row.responseFormatType === "json_schema").length,
      completionCountOneRows: rows.filter((row) => row.completionCount === 1).length,
      candidateOutputsOneRows: rows.filter((row) => row.candidateOutputsPerCompletion === 1).length,
      currentModelRows: rows.filter(
        (row) =>
          row.modelId ===
          (row.plan === "STANDARD"
            ? "google/gemini-3.5-flash"
            : "google/gemini-3.1-pro-preview"),
      ).length,
      currentProfileBoundRows: rows.filter((row) => /^[GB][0-3]_/u.test(row.profileId)).length,
      currentDifficultyBoundRows: rows.filter(
        (row) => row.difficulty === "INTERMEDIATE" || row.difficulty === "KILLER",
      ).length,
      schemaBoundRows: rows.filter((row) => /^[a-f0-9]{64}$/u.test(row.wireSchemaSha256)).length,
      tokenCapBoundRows: rows.filter(
        (row) => row.maxOutputTokens === S1_OUTPUT_CAP_BY_TYPE[row.questionType],
      ).length,
      exactRoutingRows: rows.filter(
        (row) => stableJson(row.providerRouting) === stableJson(S1_PROVIDER_ROUTING),
      ).length,
      reasoningOffRows: rows.filter(
        (row) =>
          row.reasoning.enabled === false &&
          row.reasoning.effort === "none" &&
          row.reasoning.exclude === true,
      ).length,
      rightsBoundRows: rows.filter(
        (row) =>
          row.rights.authorship === "CAMPAIGN_ORIGINAL" &&
          row.rights.externalModelProcessingAuthorized &&
          row.rights.piiReview === "NO_PII_FOUND",
      ).length,
    },
    costPlanningCheck: {
      executionPricingAttached: false,
      staleV5FlatCapsUsed: false,
      illustrativeEmergencyRatesAreExecutionAuthority: false,
      emergencyRatesUsdPer1M: EMERGENCY_RATES_USD_PER_1M,
      bodyBytesByPlan,
      outputTokensByPlan,
      serverTokenOverheadUpperBoundPerAssignment: SERVER_TOKEN_OVERHEAD_UPPER_BOUND,
      safetyMultiplier: DESIGN_SAFETY_MULTIPLIER,
      aggregateModelStratifiedMaximumUsd: illustrativeMaximumUsd,
      illustrativeMaximumUsd: conservativeMaximumUsd,
      designCeilingUsd: DESIGN_CEILING_USD,
      withinDesignCeiling: true,
      executionAuthority:
        "Attach a fresh schema-v2 exact-tag proof and materialize through campaign-v6-s1-durable-controller-v1; block if its calculated campaign cap exceeds $100.",
    },
    durableControllerBinding: {
      materializerInputType: "S1MaterializationInput",
      exactWireRowType: "S1ExactWireRow",
      structurallyTypeCheckedRows: 180,
      semanticallyMaterializedRowsWithOfflineSyntheticPriceFixture: 180,
      semanticMaterializerStatus: semanticDryBundle.status,
      semanticMaterializerConservativeMaxCostUsd:
        semanticDryBundle.globalEnvelope.maxCostUsd,
      semanticValidationSyntheticPricingIsExecutionAuthority: false,
      materializerInputSchemaVersion: unpricedBinding.schemaVersion,
      profileArtifactManifestSha256: profileArtifactManifest.manifestSha256,
      profileArtifactAliasesAllowed: profileArtifactManifest.aliasesAllowed,
      profileArtifactCount: Object.keys(profileArtifactManifest.profiles).length,
      syntheticPricingSchemaVersion: syntheticSnapshot.schemaVersion,
      syntheticCanonicalSlugBindings: syntheticPricingBindings.map(
        ({ modelId, canonicalSlug }) => ({ modelId, canonicalSlug }),
      ),
      syntheticExactRouteProviders: [
        ...new Set(syntheticPricingBindings.map((binding) => binding.exactRouteProvider)),
      ],
      syntheticServedModelAllowlistHashSetSha256: sha256(
        stableJson(
          syntheticPricingBindings
            .map((binding) => binding.servedModelAllowlistHash)
            .sort(),
        ),
      ),
      durableBindingSourceClosureSha256,
      unpricedBindingPresentPrivately: true,
      pricingPlaceholderPresent: false,
      designAuthorizationStatus: "BLOCKED_FIXTURE",
      liveMaterializationAuthorized: false,
    },
    safety: privateCore.safety,
    publicPrivacy: {
      exactPassageTextExposed: false,
      rowMembershipExposed: false,
      assignmentIdsExposed: false,
      exactWireDigestsExposed: false,
    },
    executionHolds: [
      "fresh schema-v2 exact google-vertex/global tag price proof no older than 15 minutes",
      "durable controller materialization with calculated campaign maximum <= $100",
      "dedicated zero-usage OPENROUTER_S1_API_KEY and matching provider hard limit",
      "current provider privacy/retention review",
      "fresh independent pre-dispatch audit and explicit authorization",
    ],
  } as const;
  const publicArtifact = {
    ...publicCore,
    publicArtifactSemanticSha256: sha256(stableJson(publicCore)),
  };
  const publicBytes = `${JSON.stringify(publicArtifact, null, 2)}\n`;
    return { privateArtifact, publicArtifact, privateBytes, publicBytes };
  } finally {
    transportGuard.restore();
  }
}

function writeManifest(): void {
  const lines = MANIFEST_FILES.map((relativePath) =>
    `${fileSha256(path.join(here, relativePath))}  ${relativePath.replaceAll("\\", "/")}`,
  );
  writeFileSync(paths.manifest, `${lines.join("\n")}\n`, "utf8");
}

async function main(): Promise<void> {
  const result = await compileCampaignV6S1ExactWirePreflight();
  if (process.argv.includes("--write")) {
    mkdirSync(path.dirname(paths.privateArtifact), { recursive: true });
    writeFileSync(paths.privateArtifact, result.privateBytes, "utf8");
    writeFileSync(paths.publicArtifact, result.publicBytes, "utf8");
    writeManifest();
  }
  process.stdout.write(`${JSON.stringify({
    status: result.publicArtifact.status,
    assignments: result.publicArtifact.counts.assignments,
    locallyInterceptedFetches: result.publicArtifact.counts.locallyInterceptedFetches,
    externalNetworkCalls: result.publicArtifact.counts.externalNetworkCalls,
    uniqueWireBodies: result.publicArtifact.counts.uniqueWireBodies,
    preflightSemanticSha256: result.publicArtifact.preflightSemanticSha256,
    apiCandidatesConsumed: 0,
  }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
