import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ATLAS_RESEARCH_OPENROUTER_PROVIDER_ROUTING } from "@/lib/atlas-ai";
import {
  installAtlasResearchFetchController,
  type AtlasResearchProvenance,
} from "@/lib/atlas-research-fetch-boundary";
import {
  QUESTION_GENERATION_RESEARCH_STAGES,
  QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY,
  runWithQuestionGenerationResearchRuntime,
  type QuestionGenerationResearchOperation,
  type QuestionGenerationResearchRuntime,
  type QuestionGenerationResearchStage,
} from "@/lib/question-generation-research-runtime";
import type { RunGenerationInput } from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation-types";

import {
  deriveAtlasControllerPricingSnapshotProof,
  DurableAtlasResearchController,
  sealAtlasControllerAssignmentContract,
  sealAtlasControllerPricingContract,
  sealAtlasControllerRegistry,
  type AtlasControllerParserImplementation,
  type AtlasControllerRegistryEntryDraft,
} from "../../harness/atlas-controller";
import { openTestBudgetStore } from "../../harness/ledger";
import { QuestionGenerationCallsiteAdapter } from "../../harness/question-generation-callsite-adapter";

process.env.QUESTION_QUALITY_BUDGET_GUARD_TEST_MODE = "1";
process.env.GEMINI_QUESTION_MAX_RETRIES = "1";

const MODEL = "google/gemini-3.5-flash";
const PARSER_ID = "phase-c-actual-entrypoint-v1";
const PARSER_HASH = sha("phase-c-actual-entrypoint-parser-v1");

function sha(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function maskedStrictFailure(): Response {
  return new Response(JSON.stringify({
    error: { message: "Provider returned error", code: 400 },
    usage: {
      prompt_tokens: 20,
      completion_tokens: 0,
      total_tokens: 20,
      cost: 0.001,
    },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

class CaptureRuntime implements QuestionGenerationResearchRuntime {
  readonly runtimeId = "phase-c-wire-compiler";
  readonly retryPolicy =
    QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY;
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

const generationInput: RunGenerationInput = {
  plan: [{
    subType: "BLANK_INFERENCE",
    count: 1,
    reason: "Phase-C fixed-cardinality fixture",
    targetPoints: [],
  }],
  schoolType: "HIGH",
  gradeInfo: "2",
  passageContent:
    "Human beings often mistake familiarity for understanding. A repeated claim can feel true even when the evidence remains weak. Careful readers slow down, compare alternatives, and ask which conclusion the facts actually support.",
  teacherIntentBlock: "",
  analysisContext: "",
  diffLabel: "INTERMEDIATE",
  diffInstruction: "Create one defensible intermediate blank-inference item.",
  generationPlan: "STANDARD",
};

interface CapturedRequest {
  endpoint: string;
  bodyText: string;
  body: Record<string, unknown>;
}

async function compileActualEntrypointWire(): Promise<CapturedRequest> {
  const { runQuestionGenerationWithEmptyRetry } = await import(
    "@/app/api/ai/generate-questions-auto/_lib/run-question-generation"
  );
  const originalFetch = globalThis.fetch;
  const requests: CapturedRequest[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const bodyText = init?.body;
    if (typeof bodyText !== "string") {
      throw new Error("Phase-C entrypoint compiler expected an inline JSON body");
    }
    requests.push({
      endpoint: new URL(
        typeof input === "string" || input instanceof URL ? input : input.url,
      ).toString(),
      bodyText,
      body: JSON.parse(bodyText) as Record<string, unknown>,
    });
    return maskedStrictFailure();
  }) as typeof fetch;
  try {
    const result = await runWithQuestionGenerationResearchRuntime(
      new CaptureRuntime(),
      () => runQuestionGenerationWithEmptyRetry(generationInput, {
        maxAttempts: 1,
        deadlineAt: Date.now() - 1,
        logPrefix: "PHASE-C-WIRE-COMPILER",
      }),
    );
    assert.deepEqual(result.questions, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(requests.length, 1);
  assert.equal(
    (requests[0].body.response_format as { type?: unknown }).type,
    "json_schema",
  );
  assert.deepEqual(
    requests[0].body.provider,
    ATLAS_RESEARCH_OPENROUTER_PROVIDER_ROUTING,
  );
  return requests[0];
}

const pricingSnapshotContent = {
  schemaVersion: 1,
  fetchedAt: "2026-07-15T00:00:00.000Z",
  models: [{
    id: MODEL,
    endpointRates: [{
      provider: "Google",
      endpointName: "Google | gemini-3.5-flash",
      contextLength: 1_048_576,
      promptUsdPerToken: 0.0000015,
      completionUsdPerToken: 0.000009,
      overrides: [],
    }],
  }],
};
const pricingSnapshot = {
  ...pricingSnapshotContent,
  snapshotSha256: sha(JSON.stringify(pricingSnapshotContent)),
};
const pricingProof = deriveAtlasControllerPricingSnapshotProof(
  "phase-c-price-20260715",
  pricingSnapshot,
).models[MODEL];
const pricing = sealAtlasControllerPricingContract({
  inputUsdPer1M: pricingProof.maxInputUsdPer1M,
  outputUsdPer1M: pricingProof.maxOutputUsdPer1M,
  safetyMultiplier: 1.1,
  serverTokenOverheadUpperBound: 128,
  currency: "USD",
  proofKind: "maximum-allowed-provider-list-price",
  priceSnapshotId: "phase-c-price-20260715",
  priceSnapshotHash: pricingSnapshot.snapshotSha256,
  providerAllowlistHash: pricingProof.providerAllowlistHash,
  validAt: "2026-07-15T00:00:00.000Z",
  validThrough: "2026-07-16T00:00:00.000Z",
  basis: "zero-network Phase-C fixture",
});

const parser: AtlasControllerParserImplementation = {
  artifactHash: PARSER_HASH,
  parseResponseBody: () => ({
    disposition: "no_candidate",
    dispositionReason: "masked_strict_failure",
    normalizedSemanticCandidates: [],
  }),
};

test("sealed runner invokes the actual entrypoint and treats strict failure as ITT no-candidate", async () => {
  const compiled = await compileActualEntrypointWire();
  const body = compiled.body;
  const responseFormat = body.response_format as {
    json_schema: { schema: Record<string, unknown> };
  };
  const schema = responseFormat.json_schema.schema;
  const questions = (
    schema.properties as { questions: Record<string, unknown> }
  ).questions;
  assert.equal(questions.minItems, 1);
  assert.equal(questions.maxItems, 1);

  const promptHash = sha(stableJson({
    messages: body.messages ?? null,
    prompt: body.prompt ?? null,
    input: body.input ?? null,
    instructions: body.instructions ?? null,
  }));
  const schemaHash = sha(stableJson(schema));
  const provenance: AtlasResearchProvenance = {
    requestedModel: MODEL,
    effectiveModel: MODEL,
    plan: "STANDARD",
    stage: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
    promptHash,
    schemaHash,
    gateHash: sha("phase-c-gate-v1"),
    ladderHash: null,
    policyHash: sha("phase-c-policy-v1"),
    corpus: {
      corpusId: "phase-c-entrypoint-fixture",
      rowId: "blank-001",
      passageHash: sha(generationInput.passageContent),
    },
    runnerVersion: "phase-c-actual-entrypoint-v1",
    gitVersion: "zero-network",
  };
  const candidateContract = {
    attestationId: PARSER_ID,
    attestationHash: sha(stableJson({
      attestationId: PARSER_ID,
      candidatesPerCompletion: 1,
      parserArtifactHash: PARSER_HASH,
    })),
    candidatesPerCompletion: 1,
    parserArtifactHash: PARSER_HASH,
  };
  const maxOutputTokens = Math.max(
    Number(body.max_tokens) || 0,
    Number(body.max_completion_tokens) || 0,
    Number(body.max_output_tokens) || 0,
  );
  assert.ok(maxOutputTokens > 0);
  const rootEntry: AtlasControllerRegistryEntryDraft = {
    entryId: "phase-c-actual-structured-root",
    purpose: "candidate",
    candidateProducing: true,
    provenance,
    wire: {
      endpointHash: sha(compiled.endpoint),
      requestMode: "exact",
      wireBodyHash: sha(compiled.bodyText),
      wirePromptHash: promptHash,
      wireSchemaHash: schemaHash,
      outputShape: "json-schema-object",
      structurallyFixedOutputsPerCompletion: 1,
      completionCount: 1,
      maxOutputTokens,
      maxRequestBodyUtf8Bytes: Buffer.byteLength(compiled.bodyText, "utf8"),
      derivationContract: null,
    },
    candidateContract,
    pricing,
    maxUsesPerAssignment: 1,
  };

  const tempRoot = await mkdtemp(join(tmpdir(), "phase-c-actual-entrypoint-"));
  const registryPath = join(tempRoot, "registry.json");
  const storePath = join(tempRoot, "budget.sqlite");
  const experimentId = "EXP-PHASE-C";
  const phaseId = "entrypoint";
  const batchId = "batch-001";
  const assignmentId = "assignment-001";
  const operationId = `${experimentId}:${phaseId}:${batchId}:${assignmentId}`;
  await writeFile(
    registryPath,
    `${JSON.stringify({
      schemaVersion: 1,
      status: "preregistering",
      registeredExperiments: [{
        id: experimentId,
        status: "registered",
        phases: [{
          id: phaseId,
          status: "registered",
          apiCandidateBudget: 1,
          maxPhysicalProviderCalls: 1,
          maxCostUsd: 1,
        }],
      }],
    }, null, 2)}\n`,
    "utf8",
  );
  const store = openTestBudgetStore(storePath, registryPath);
  store.reserveBatch({
    experimentId,
    phaseId,
    batchId,
    idempotencyKey: "reserve-phase-c-entrypoint",
    candidateSlots: 1,
    maxProviderCalls: 1,
    maxCostUsd: 1,
  }, { apply: true });
  const assignmentContract = sealAtlasControllerAssignmentContract({
    contractId: "phase-c-one-question-envelope",
    maxPhysicalCalls: 1,
    maxCandidateOutputs: 1,
    maxCostUsd: 1,
  });
  const registry = sealAtlasControllerRegistry({
    schemaVersion: 2,
    controllerId: "phase-c-actual-entrypoint-controller",
    operationIdPrefix: `${experimentId}:${phaseId}:${batchId}:`,
    experimentId,
    phaseId,
    batchId,
    entries: [rootEntry],
    assignmentContracts: [assignmentContract],
    transitions: [{
      transitionId: "phase-c-root",
      fromEntryId: null,
      toEntryId: rootEntry.entryId,
    }],
  });
  const controller = new DurableAtlasResearchController({
    store,
    registry,
    parsers: { [PARSER_ID]: parser },
    pricingSnapshots: { "phase-c-price-20260715": pricingSnapshot },
    now: () => Date.parse("2026-07-15T12:00:00.000Z"),
  });
  const adapter = new QuestionGenerationCallsiteAdapter({
    runtimeId: "phase-c-actual-entrypoint-runtime",
    controller,
    registry,
    expectedEndpoint: compiled.endpoint,
    operationId,
    assignmentId,
    assignmentContractId: assignmentContract.contractId,
    rootEntryId: rootEntry.entryId,
    childEntryIds: {},
  });
  const { runPhaseCQuestionGenerationAssignment } = await import(
    "../../harness/question-generation-phase-c-runner"
  );
  await assert.rejects(
    () => runPhaseCQuestionGenerationAssignment({
      adapter,
      generation: {
        ...generationInput,
        plan: [{ ...generationInput.plan[0], count: 2 }],
      },
      maxAttempts: 1,
      deadlineAt: Date.now() - 1,
    }),
    /differs from the sealed semantic count/,
  );

  const originalFetch = globalThis.fetch;
  const secondRunBodies: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const bodyText = init?.body;
    if (typeof bodyText !== "string") {
      throw new Error("Phase-C sealed run expected an inline JSON body");
    }
    assert.equal(sha(bodyText), rootEntry.wire.wireBodyHash);
    secondRunBodies.push(JSON.parse(bodyText) as Record<string, unknown>);
    return maskedStrictFailure();
  }) as typeof fetch;
  const uninstall = installAtlasResearchFetchController(controller);
  try {
    const result = await runPhaseCQuestionGenerationAssignment({
      adapter,
      generation: generationInput,
      maxAttempts: 1,
      deadlineAt: Date.now() - 1,
    });
    assert.deepEqual(result.questions, []);
    assert.equal(secondRunBodies.length, 1);
    assert.equal(
      (secondRunBodies[0].response_format as { type?: unknown }).type,
      "json_schema",
    );
    assert.deepEqual(
      secondRunBodies[0].provider,
      ATLAS_RESEARCH_OPENROUTER_PROVIDER_ROUTING,
    );

    const recovery = controller.recoverAssignment(assignmentId);
    assert.equal(recovery.assignment.state, "closed");
    assert.equal(recovery.calls.length, 1);
    assert.equal(recovery.calls[0].candidateSlots.length, 1);
    assert.equal(recovery.calls[0].candidateSlots[0].outcome, "no_candidate");
  } finally {
    uninstall();
    globalThis.fetch = originalFetch;
    store.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});
