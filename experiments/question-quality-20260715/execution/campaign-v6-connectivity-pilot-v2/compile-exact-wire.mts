import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { RunGenerationInput } from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation-types";
import type { QuestionGenerationResearchPromptProfileId } from "@/lib/question-generation-research-profiles";
import type {
  QuestionGenerationResearchOperation,
  QuestionGenerationResearchRetryPolicy,
  QuestionGenerationResearchRuntime,
  QuestionGenerationResearchStage,
} from "@/lib/question-generation-research-runtime";
import * as protocolSchemaModule from "./protocol-schema";
import type { ConnectivityPilotProtocolV2 } from "./protocol-schema";

const protocolSchemaExports =
  (protocolSchemaModule as unknown as { default?: typeof protocolSchemaModule }).default ??
  protocolSchemaModule;
const { protocolAuthoritySha256, validateConnectivityPilotProtocolV2 } = protocolSchemaExports;

export const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../../../..");
const v1Dir = path.join(here, "../campaign-v6-connectivity-pilot-v1");
const corpusDir = path.join(
  repoRoot,
  "experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1",
);

export const paths = {
  protocolV2: path.join(here, "protocol-v2.json"),
  originalProtocolV1: path.join(v1Dir, "protocol.json"),
  corpusPublic: path.join(corpusDir, "source-public.json"),
  corpusPrivate: path.join(corpusDir, "private/pilot-source.private.json"),
  privateArtifact: path.join(here, "private/exact-wire-v2.private.json"),
  publicArtifact: path.join(here, "offline-exact-wire-seal-v2.json"),
} as const;

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const PROFILE_ID = "B0_CURRENT_CONTROL" as const;
const MODELS = {
  STANDARD: "google/gemini-3.5-flash",
  PREMIUM: "google/gemini-3.1-pro-preview",
} as const;
const PROVIDER = {
  order: ["google-vertex/global"],
  only: ["google-vertex/global"],
  allow_fallbacks: false,
  require_parameters: true,
  data_collection: "deny",
  zdr: true,
} as const;
const REASONING = { enabled: false, effort: "none", exclude: true } as const;
const MAX_OUTPUT_TOKENS = 4_000;

const SOURCE_PATHS = [
  "src/app/api/ai/generate-questions-auto/_lib/constants.ts",
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts",
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-helpers.ts",
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-types.ts",
  "src/app/api/ai/generate-questions-auto/_lib/prompts.ts",
  "src/app/api/ai/generate-questions-auto/_lib/schemas.ts",
  "src/app/api/ai/generate-questions-auto/_lib/generate-with-retry.ts",
  "src/lib/question-generation-llm.ts",
  "src/lib/question-generation-prompt-contract.ts",
  "src/lib/question-generation-research-profiles.ts",
  "src/lib/question-generation-research-schema.ts",
  "src/lib/question-generation-research-runtime.ts",
  "src/lib/question-type-generation-settings/index.ts",
  "src/lib/question-type-generation-settings/blank-inference.ts",
  "src/lib/question-quality/dispatcher.ts",
  "src/lib/question-quality/core.ts",
  "src/lib/question-quality/validators/blank/inference.ts",
  "src/lib/question-quality/validators/blank/inference-distractor.ts",
  "src/lib/question-quality/validators/blank/shared.ts",
  "src/lib/question-quality/validators/blank/paraphrase.ts",
  "src/lib/question-quality/validators/blank/seam.ts",
  "src/lib/question-quality/validators/options.ts",
  "src/lib/atlas-ai.ts",
  "src/lib/atlas-research-fetch-boundary.ts",
  "src/lib/atlas-fetch-scope-coordinator.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v1/protocol.json",
  "experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1/source-public.json",
  "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/openrouter-question-parser.ts",
  "experiments/question-quality-20260715/harness/atlas-controller.ts",
  "experiments/question-quality-20260715/harness/ledger.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/protocol-schema.ts",
] as const;

type Plan = keyof typeof MODELS;
type JsonRecord = Record<string, unknown>;

interface OriginalProtocolV1Commitment {
  schemaVersion: string;
  status: string;
  source: { rowPublicId: string; questionType: string; publicCorpusSha256: string };
  fixedAssignmentSurface: {
    profileId: string;
    difficulty: string;
    schoolType: string;
    gradeInfo: string;
    questionCount: number;
    qualityMode: string;
    attemptIndex: number;
    teacherIntentBlock: string;
    analysisContext: string;
    customPrompt: string;
    targetPointCount: number;
  };
  assignments: Array<{ ordinal: number; plan: Plan; modelId: string; maxOutputTokens: number }>;
}

interface PrivateCorpus {
  row: { publicId: string; questionType: string; passageText: string };
}

interface PublicCorpus {
  status: string;
  row: {
    publicId: string;
    questionType: string;
    passageSha256: string;
    machinePiiPatternHits: number;
    manualPiiObserved: boolean;
  };
}

interface CapturedRequest {
  endpoint: string;
  bodyText: string;
  body: JsonRecord;
}

export interface PilotExactWirePrivateRow {
  ordinal: 1 | 2;
  plan: Plan;
  modelId: string;
  endpoint: string;
  bodyText: string;
  bodySha256: string;
  bodyUtf8Bytes: number;
  promptSha256: string;
  schemaSha256: string;
  requestEnvelopeSha256: string;
  profileArtifactSha256: string;
  gateArtifactSha256: string;
  policyArtifactSha256: string;
  maxOutputTokens: 4000;
  completionCount: 1;
  candidateOutputsPerCompletion: 1;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .filter(([, child]) => child !== undefined)
        // UTF-16 code-unit ordering is the repository's canonical JSON order;
        // locale collation can vary by ICU build and broke cross-process seals.
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function sourceClosure() {
  return SOURCE_PATHS.map((relativePath) => {
    const bytes = readFileSync(path.join(repoRoot, relativePath));
    return { path: relativePath, bytes: bytes.byteLength, sha256: sha256(bytes) };
  });
}

function artifactHash(closure: ReturnType<typeof sourceClosure>, pathsToBind: readonly string[]) {
  const selected = closure.filter((row) => pathsToBind.includes(row.path));
  assert.equal(selected.length, pathsToBind.length);
  return sha256(stableJson(selected));
}

function gitVersion(closureHash: string): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const head = result.stdout.trim();
  assert.match(head, /^[a-f0-9]{40}$/u);
  return `${head}-worktree-${closureHash.slice(0, 16)}`;
}

function isolateEnvironmentWithoutReadingSecretValues(): void {
  const sensitiveName =
    /(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|OPENROUTER|ATLASCLOUD|GEMINI|ANTHROPIC|PREMIUM_QGEN|QGEN_)/iu;
  for (const name of Object.keys(process.env)) {
    if (sensitiveName.test(name)) delete process.env[name];
  }
  process.env.OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
  process.env.OPENROUTER_API_KEY = "offline-compiler-dummy-not-a-secret";
  process.env.OPENROUTER_STANDARD_MODEL = MODELS.STANDARD;
  process.env.PREMIUM_QGEN_MODEL_ID = MODELS.PREMIUM;
  process.env.OPENROUTER_GEMINI_REASONING_EFFORT = "none";
  process.env.OPENROUTER_REASONING_EFFORT = "none";
}

function maskedStrictFailure(): Response {
  return new Response(
    JSON.stringify({
      error: { message: "offline compiler sentinel", code: 400 },
      usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1, cost: 0 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

class CaptureRuntime implements QuestionGenerationResearchRuntime {
  readonly runtimeId = "campaign-v6-connectivity-pilot-v2-offline-compiler";
  readonly expectedQuestionsPerStructuredCall = 1;

  constructor(readonly retryPolicy: Readonly<QuestionGenerationResearchRetryPolicy>) {}

  async runAssignment<T>(fn: () => T | Promise<T>): Promise<T> { return fn(); }
  async runOperation<T>(
    _operation: Readonly<QuestionGenerationResearchOperation>,
    fn: () => T | Promise<T>,
  ): Promise<T> { return fn(); }
  async runStage<T>(
    _stage: Readonly<QuestionGenerationResearchStage>,
    fn: () => T | Promise<T>,
  ): Promise<T> { return fn(); }
  async observeCandidateValues(): Promise<void> {}
  async decideCandidateValue(): Promise<void> {}
}

function validateCapturedBody(captured: CapturedRequest, plan: Plan): {
  promptSha256: string;
  schemaSha256: string;
} {
  assert.equal(captured.endpoint, ENDPOINT);
  const body = captured.body;
  assert.equal(body.model, MODELS[plan]);
  assert.deepEqual(body.provider, PROVIDER);
  assert.deepEqual(body.reasoning, REASONING);
  assert.equal(body.plugins, undefined);
  assert.equal(body.models, undefined);
  assert.notEqual(body.stream, true);
  const responseFormat = body.response_format;
  assert(isRecord(responseFormat));
  assert.equal(responseFormat.type, "json_schema");
  assert(isRecord(responseFormat.json_schema));
  assert.equal(responseFormat.json_schema.strict, true);
  const schema = responseFormat.json_schema.schema;
  assert(isRecord(schema));
  assert(isRecord(schema.properties));
  const questions = schema.properties.questions;
  assert(isRecord(questions));
  assert.equal(questions.minItems, 1);
  assert.equal(questions.maxItems, 1);
  const tokenCaps = [body.max_tokens, body.max_completion_tokens, body.max_output_tokens]
    .filter((value): value is number => typeof value === "number");
  assert.deepEqual(tokenCaps, [MAX_OUTPUT_TOKENS]);
  assert.equal(body.n === undefined ? 1 : body.n, 1);
  const promptSurface = {
    messages: body.messages ?? null,
    prompt: body.prompt ?? null,
    input: body.input ?? null,
    instructions: body.instructions ?? null,
  };
  return { promptSha256: sha256(stableJson(promptSurface)), schemaSha256: sha256(stableJson(schema)) };
}

export async function compileConnectivityPilotExactWire() {
  isolateEnvironmentWithoutReadingSecretValues();
  const originalFetch = globalThis.fetch;
  let importNetworkAttempts = 0;
  globalThis.fetch = (async () => {
    importNetworkAttempts += 1;
    throw new Error("OFFLINE_IMPORT_NETWORK_BLOCKED");
  }) as typeof fetch;

  let generationModule: typeof import("@/app/api/ai/generate-questions-auto/_lib/run-question-generation");
  let profilesModule: typeof import("@/lib/question-generation-research-profiles");
  let runtimeModule: typeof import("@/lib/question-generation-research-runtime");
  let constantsModule: typeof import("@/app/api/ai/generate-questions-auto/_lib/constants");
  try {
    [generationModule, profilesModule, runtimeModule, constantsModule] = await Promise.all([
      import("@/app/api/ai/generate-questions-auto/_lib/run-question-generation"),
      import("@/lib/question-generation-research-profiles"),
      import("@/lib/question-generation-research-runtime"),
      import("@/app/api/ai/generate-questions-auto/_lib/constants"),
    ]);
    assert.equal(importNetworkAttempts, 0, "production import attempted network I/O");

    const protocol = validateConnectivityPilotProtocolV2(readJson<unknown>(paths.protocolV2));
    const originalProtocol = readJson<OriginalProtocolV1Commitment>(paths.originalProtocolV1);
    const corpusPrivate = readJson<PrivateCorpus>(paths.corpusPrivate);
    const corpusPublic = readJson<PublicCorpus>(paths.corpusPublic);
    assert.equal(protocol.schemaVersion, "question-quality-v6-connectivity-pilot-protocol-v2");
    assert.equal(protocol.status, "OFFLINE_RUNNER_SEALED_EXECUTION_BLOCKED_PENDING_HOSTILE_AUDIT");
    assert.equal(
      protocol.authorityCommitment.originalProtocolV1Sha256,
      sha256(readFileSync(paths.originalProtocolV1)),
    );
    assert.equal(
      protocol.authorityCommitment.originalPublicCorpusSha256,
      sha256(readFileSync(paths.corpusPublic)),
    );
    assert.equal(
      protocol.authorityCommitment.authoritySemanticSha256,
      protocolAuthoritySha256(protocol),
    );
    assert.equal(originalProtocol.schemaVersion, "question-quality-v6-connectivity-pilot-v1");
    assert.equal(originalProtocol.status, "DESIGN_ONLY_EXECUTION_BLOCKED");
    assert.equal(originalProtocol.source.publicCorpusSha256, sha256(readFileSync(paths.corpusPublic)));
    assert.equal(corpusPublic.status, "SEALED_ORIGINAL_RUN_IN_SOURCE_NOT_DISPATCH_AUTHORIZATION");
    assert.equal(corpusPrivate.row.publicId, protocol.authorityCommitment.originalRowPublicId);
    assert.equal(corpusPublic.row.publicId, protocol.authorityCommitment.originalRowPublicId);
    assert.equal(corpusPrivate.row.questionType, "BLANK_INFERENCE");
    assert.equal(corpusPublic.row.questionType, "BLANK_INFERENCE");
    assert.equal(corpusPublic.row.machinePiiPatternHits, 0);
    assert.equal(corpusPublic.row.manualPiiObserved, false);
    assert.equal(sha256(corpusPrivate.row.passageText), corpusPublic.row.passageSha256);
    assert.equal(protocol.completeProductionInput.profileId, PROFILE_ID);
    assert.equal(protocol.completeProductionInput.difficulty, "INTERMEDIATE");
    assert.equal(protocol.completeProductionInput.planItem.count, 1);
    assert.equal(protocol.completeProductionInput.qualityMode, "strict");
    assert.equal(protocol.completeProductionInput.attemptIndex, 0);
    assert.deepEqual(protocol.completeProductionInput.planItem.targetPoints, []);
    assert.equal(protocol.completeProductionInput.teacherIntentBlock, "");
    assert.equal(protocol.completeProductionInput.analysisContext, "");
    assert.equal(protocol.completeProductionInput.customPrompt, "");
    assert.equal(protocol.completeProductionInput.schoolType, "고등학교");
    assert.equal(protocol.completeProductionInput.gradeInfo, "2학년");

    const generationExports =
      (generationModule as unknown as { default?: typeof generationModule }).default ??
      generationModule;
    const profilesExports =
      (profilesModule as unknown as { default?: typeof profilesModule }).default ?? profilesModule;
    const runtimeExports =
      (runtimeModule as unknown as { default?: typeof runtimeModule }).default ?? runtimeModule;
    const { runQuestionGeneration } = generationExports;
    const { runWithQuestionGenerationResearchPromptProfile } = profilesExports;
    const { runWithQuestionGenerationResearchRuntime } = runtimeExports;
    const diffInstruction = constantsModule.DIFF_DESCRIPTION.INTERMEDIATE;
    assert(typeof diffInstruction === "string" && diffInstruction.length > 0);

    const closure = sourceClosure();
    const closureSha256 = sha256(stableJson(closure));
    const version = gitVersion(closureSha256);
    const profileArtifactSha256 = artifactHash(closure, [
      "src/lib/question-generation-research-profiles.ts",
      "src/lib/question-generation-research-schema.ts",
      "src/lib/question-generation-prompt-contract.ts",
      "src/app/api/ai/generate-questions-auto/_lib/prompts.ts",
    ]);
    const gateArtifactSha256 = artifactHash(closure, [
      "src/lib/question-quality/dispatcher.ts",
      "src/lib/question-quality/core.ts",
      "src/lib/question-quality/validators/blank/inference.ts",
      "src/lib/question-quality/validators/blank/inference-distractor.ts",
      "src/lib/question-quality/validators/blank/shared.ts",
      "src/lib/question-quality/validators/blank/paraphrase.ts",
      "src/lib/question-quality/validators/blank/seam.ts",
      "src/lib/question-quality/validators/options.ts",
      "src/lib/question-type-generation-settings/blank-inference.ts",
    ]);
    const policyArtifactSha256 = artifactHash(closure, [
      "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
      "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts",
      "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-helpers.ts",
      "src/app/api/ai/generate-questions-auto/_lib/generate-with-retry.ts",
      "src/lib/question-generation-llm.ts",
      "src/lib/atlas-ai.ts",
      "src/lib/atlas-research-fetch-boundary.ts",
    ]);

    const rows: PilotExactWirePrivateRow[] = [];
    for (const assignment of [...protocol.pricingAmendment.assignments]
      .sort((a, b) => a.ordinal - b.ordinal)) {
      assert(assignment.ordinal === 1 || assignment.ordinal === 2);
      assert.equal(assignment.modelId, MODELS[assignment.plan]);
      assert.equal(assignment.maxOutputTokens, MAX_OUTPUT_TOKENS);
      const generation: RunGenerationInput = {
        plan: [{
          subType: "BLANK_INFERENCE",
          count: 1,
          reason: String(protocol.completeProductionInput.planItem.reason),
          targetPoints: [],
        }],
        schoolType: protocol.completeProductionInput.schoolType,
        gradeInfo: protocol.completeProductionInput.gradeInfo,
        passageContent: corpusPrivate.row.passageText,
        teacherIntentBlock: "",
        analysisContext: "",
        diffLabel: "INTERMEDIATE",
        diffInstruction,
        generationPlan: assignment.plan,
        customPrompt: "",
      };
      const captured: CapturedRequest[] = [];
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const endpoint = new URL(
          typeof input === "string" || input instanceof URL ? input : input.url,
        ).toString();
        assert.equal(endpoint, ENDPOINT);
        assert.equal(init?.method, "POST");
        assert(typeof init?.body === "string");
        captured.push({ endpoint, bodyText: init.body, body: JSON.parse(init.body) as JsonRecord });
        return maskedStrictFailure();
      }) as typeof fetch;
      const originalLog = console.log;
      const originalWarn = console.warn;
      const originalError = console.error;
      console.log = () => undefined;
      console.warn = () => undefined;
      console.error = () => undefined;
      try {
        const questions = await runWithQuestionGenerationResearchPromptProfile(
          PROFILE_ID as QuestionGenerationResearchPromptProfileId,
          () => runWithQuestionGenerationResearchRuntime(
            new CaptureRuntime(
              runtimeExports.QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY,
            ),
            () => runQuestionGeneration(generation, {
              qualityMode: "strict",
              attemptIndex: 0,
              deadlineAt: Date.now() - 1,
            }),
          ),
        );
        assert.deepEqual(questions, []);
      } finally {
        console.log = originalLog;
        console.warn = originalWarn;
        console.error = originalError;
      }
      assert.equal(captured.length, 1, `${assignment.plan} must compile exactly one fetch`);
      const wire = captured[0]!;
      const validated = validateCapturedBody(wire, assignment.plan);
      const requestEnvelope = {
        profileId: PROFILE_ID,
        ...generation,
        passageContent: corpusPrivate.row.passageText,
        qualityMode: "strict",
        attemptIndex: 0,
      };
      rows.push({
        ordinal: assignment.ordinal,
        plan: assignment.plan,
        modelId: assignment.modelId,
        endpoint: wire.endpoint,
        bodyText: wire.bodyText,
        bodySha256: sha256(wire.bodyText),
        bodyUtf8Bytes: Buffer.byteLength(wire.bodyText, "utf8"),
        promptSha256: validated.promptSha256,
        schemaSha256: validated.schemaSha256,
        requestEnvelopeSha256: sha256(stableJson(requestEnvelope)),
        profileArtifactSha256,
        gateArtifactSha256,
        policyArtifactSha256,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        completionCount: 1,
        candidateOutputsPerCompletion: 1,
      });
    }
    assert.deepEqual(rows.map((row) => row.plan), ["STANDARD", "PREMIUM"]);
    assert.equal(new Set(rows.map((row) => row.bodySha256)).size, 2);

    const privateCore = {
      schemaVersion: "question-quality-v6-connectivity-pilot-exact-wire-private-v2",
      status: "OFFLINE_PRODUCTION_CORE_EXACT_WIRE_EXECUTION_BLOCKED",
      confidentiality:
        "PRIVATE_GIT_IGNORED: contains exact prompt, passage, request bodies, and commitments.",
      source: {
        protocolV1Sha256: sha256(readFileSync(paths.originalProtocolV1)),
        protocolV2AuthoritySemanticSha256: protocol.authorityCommitment.authoritySemanticSha256,
        publicCorpusSha256: sha256(readFileSync(paths.corpusPublic)),
        privateCorpusArtifactSha256: sha256(readFileSync(paths.corpusPrivate)),
        passageSha256: corpusPublic.row.passageSha256,
      },
      sourceClosure: closure,
      sourceClosureSha256: closureSha256,
      gitVersion: version,
      fixedProductionInput: {
        profileId: PROFILE_ID,
        questionType: "BLANK_INFERENCE",
        difficulty: "INTERMEDIATE",
        schoolType: protocol.completeProductionInput.schoolType,
        gradeInfo: protocol.completeProductionInput.gradeInfo,
        planReason: protocol.completeProductionInput.planItem.reason,
        diffInstructionSha256: sha256(diffInstruction),
        teacherIntentBlock: "",
        analysisContext: "",
        customPrompt: "",
        targetPoints: [],
        qualityMode: "strict",
        attemptIndex: 0,
        typeSettingsPresent: false,
        diversityPresent: false,
      },
      rows,
      safety: {
        productionModulesImportedAfterFetchDenyGuard: true,
        importTimeNetworkAttempts: importNetworkAttempts,
        locallyInterceptedFetches: 2,
        externalNetworkCalls: 0,
        providerCalls: 0,
        modelCalls: 0,
        databaseCalls: 0,
        realCredentialValuesRead: 0,
        apiCandidatesConsumed: 0,
        liveExecutionAuthorized: false,
      },
    } as const;
    const privateSemanticSha256 = sha256(stableJson(privateCore));
    const privateArtifact = { ...privateCore, privateSemanticSha256 };
    const privateBytes = `${JSON.stringify(privateArtifact, null, 2)}\n`;
    const publicCore = {
      schemaVersion: "question-quality-v6-connectivity-pilot-exact-wire-public-v2",
      status: "OFFLINE_PRODUCTION_CORE_EXACT_WIRE_EXECUTION_BLOCKED",
      originalProtocolSha256: privateCore.source.protocolV1Sha256,
      protocolV2AuthoritySemanticSha256:
        privateCore.source.protocolV2AuthoritySemanticSha256,
      publicCorpusSha256: privateCore.source.publicCorpusSha256,
      privateArtifactSha256: sha256(privateBytes),
      sourceClosureSha256: closureSha256,
      counts: {
        assignments: 2,
        locallyInterceptedFetches: 2,
        externalNetworkCalls: 0,
        providerCalls: 0,
        modelCalls: 0,
        apiCandidatesConsumed: 0,
      },
      wire: {
        serialOrder: ["STANDARD", "PREMIUM"],
        bodyUtf8BytesByPlan: Object.fromEntries(rows.map((row) => [row.plan, row.bodyUtf8Bytes])),
        maxOutputTokensEach: MAX_OUTPUT_TOKENS,
        completionCountEach: 1,
        semanticCandidateCapEach: 1,
        exactProviderTag: "google-vertex/global",
        strictJsonSchemaRows: 2,
        exactRouteRows: 2,
        reasoningOffRows: 2,
      },
      privacy: {
        exactPromptExposed: false,
        exactPassageExposed: false,
        questionOrExplanationExposed: false,
        providerGenerationIdExposed: false,
        credentialValueExposedOrHashed: false,
      },
      safety: privateCore.safety,
      executionHolds: [
        "fresh schema-v2 exact-tag pricing and endpoint-capability evidence",
        "explicit v2 cost-cap amendment derived from these exact body byte counts",
        "two one-entry durable registries and one shared two-slot batch",
        "independent hostile audit and explicit dispatch authorization",
      ],
    } as const;
    const publicArtifact = {
      ...publicCore,
      publicSemanticSha256: sha256(stableJson(publicCore)),
    };
    return {
      privateArtifact,
      publicArtifact,
      privateBytes,
      publicBytes: `${JSON.stringify(publicArtifact, null, 2)}\n`,
    };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main(): Promise<void> {
  const result = await compileConnectivityPilotExactWire();
  if (process.argv.includes("--write")) {
    mkdirSync(path.dirname(paths.privateArtifact), { recursive: true });
    writeFileSync(paths.privateArtifact, result.privateBytes, "utf8");
    writeFileSync(paths.publicArtifact, result.publicBytes, "utf8");
  }
  process.stdout.write(`${JSON.stringify({
    status: result.publicArtifact.status,
    bodyUtf8BytesByPlan: result.publicArtifact.wire.bodyUtf8BytesByPlan,
    locallyInterceptedFetches: 2,
    externalNetworkCalls: 0,
    providerCalls: 0,
    modelCalls: 0,
    apiCandidatesConsumed: 0,
  }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
