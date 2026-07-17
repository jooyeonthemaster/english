import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createAtlasResearchFetchDispatcher,
  installAtlasResearchFetchController,
  type AtlasResearchPurpose,
  type AtlasResearchProvenance,
} from "@/lib/atlas-research-fetch-boundary";
import {
  QUESTION_GENERATION_RESEARCH_STAGES,
  decideQuestionGenerationResearchCandidate,
  observeQuestionGenerationResearchCandidates,
  runQuestionGenerationResearchOperation,
  runQuestionGenerationResearchStage,
  runWithQuestionGenerationResearchRuntime,
  type QuestionGenerationResearchStageKey,
} from "@/lib/question-generation-research-runtime";

import {
  deriveAtlasControllerPricingSnapshotProof,
  DurableAtlasResearchController,
  sealAtlasControllerAssignmentContract,
  sealAtlasControllerPricingContract,
  sealAtlasControllerRegistry,
  type AtlasControllerParserImplementation,
  type AtlasControllerRegistryEntryDraft,
  type AtlasControllerStageTransition,
} from "./atlas-controller";
import { openTestBudgetStore } from "./ledger";
import { QuestionGenerationCallsiteAdapter } from "./question-generation-callsite-adapter";

process.env.QUESTION_QUALITY_BUDGET_GUARD_TEST_MODE = "1";

const ENDPOINT = "https://mock.invalid/v1/chat/completions";
const MODEL = "google/gemini-3.5-flash";
const PARSER_ID = "callsite-full-question-v1";
const PARSER_HASH = createHash("sha256").update("callsite-parser-v1").digest("hex");

function sha(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]),
    );
  }
  return value;
}

function stable(value: unknown): string {
  return JSON.stringify(normalize(value));
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
  "callsite-price-20260715",
  pricingSnapshot,
).models[MODEL];
const pricing = sealAtlasControllerPricingContract({
  inputUsdPer1M: pricingProof.maxInputUsdPer1M,
  outputUsdPer1M: pricingProof.maxOutputUsdPer1M,
  safetyMultiplier: 1.1,
  serverTokenOverheadUpperBound: 128,
  currency: "USD",
  proofKind: "maximum-allowed-provider-list-price",
  priceSnapshotId: "callsite-price-20260715",
  priceSnapshotHash: pricingSnapshot.snapshotSha256,
  providerAllowlistHash: pricingProof.providerAllowlistHash,
  validAt: "2026-07-15T00:00:00.000Z",
  validThrough: "2026-07-16T00:00:00.000Z",
  basis: "zero-network fixture",
});

interface EntrySpec {
  entryId: string;
  stage: QuestionGenerationResearchStageKey;
  purpose: AtlasResearchPurpose;
  candidateCount: number;
  exact: boolean;
  prompt: string;
  allowedParentEntryIds?: string[];
}

function schemaFor(spec: EntrySpec): Record<string, unknown> {
  if (spec.candidateCount > 0) {
    return {
      type: "object",
      properties: {
        questions: {
          type: "array",
          minItems: spec.candidateCount,
          maxItems: spec.candidateCount,
          items: {
            type: "object",
            properties: { id: { type: "string" }, text: { type: "string" } },
            required: ["id", "text"],
            additionalProperties: false,
          },
        },
      },
      required: ["questions"],
      additionalProperties: false,
    };
  }
  return {
    type: "object",
    properties: { design: { type: "string" } },
    required: ["design"],
    additionalProperties: false,
  };
}

function requestBody(spec: EntrySpec): string {
  const schema = schemaFor(spec);
  return JSON.stringify({
    model: MODEL,
    messages: [{ role: "user", content: spec.prompt }],
    response_format: {
      type: "json_schema",
      json_schema: { name: spec.entryId, strict: true, schema },
    },
    max_output_tokens: 128,
  });
}

function provenance(spec: EntrySpec): AtlasResearchProvenance {
  const body = JSON.parse(requestBody(spec)) as Record<string, unknown>;
  return {
    requestedModel: MODEL,
    effectiveModel: MODEL,
    plan: "STANDARD",
    stage: spec.stage,
    promptHash: sha(stable({
      messages: body.messages ?? null,
      prompt: body.prompt ?? null,
      input: body.input ?? null,
      instructions: body.instructions ?? null,
    })),
    schemaHash: sha(stable(schemaFor(spec))),
    gateHash: sha("callsite-gate-v1"),
    ladderHash: null,
    policyHash: sha("callsite-policy-v1"),
    corpus: {
      corpusId: "callsite-fixture",
      rowId: "row-001",
      passageHash: sha("fixture passage"),
    },
    runnerVersion: "callsite-adapter-test-v1",
    gitVersion: "zero-network",
  };
}

function registryEntry(spec: EntrySpec): AtlasControllerRegistryEntryDraft {
  const body = requestBody(spec);
  const candidateContract = spec.candidateCount > 0
    ? {
        attestationId: PARSER_ID,
        attestationHash: sha(stable({
          attestationId: PARSER_ID,
          candidatesPerCompletion: spec.candidateCount,
          parserArtifactHash: PARSER_HASH,
        })),
        candidatesPerCompletion: spec.candidateCount,
        parserArtifactHash: PARSER_HASH,
      }
    : null;
  return {
    entryId: spec.entryId,
    purpose: spec.purpose,
    candidateProducing: spec.candidateCount > 0,
    provenance: provenance(spec),
    wire: {
      endpointHash: sha(ENDPOINT),
      requestMode: spec.exact ? "exact" : "derived",
      wireBodyHash: spec.exact ? sha(body) : null,
      wirePromptHash: spec.exact ? provenance(spec).promptHash : null,
      wireSchemaHash: sha(stable(schemaFor(spec))),
      outputShape: "json-schema-object",
      structurallyFixedOutputsPerCompletion: spec.candidateCount || 1,
      completionCount: 1,
      maxOutputTokens: 128,
      maxRequestBodyUtf8Bytes: 16_384,
      derivationContract: spec.exact
        ? null
        : {
            contractId: `derive-${spec.entryId}`,
            artifactHash: sha(`artifact-${spec.entryId}`),
            allowedParentEntryIds: spec.allowedParentEntryIds ?? [],
          },
    },
    candidateContract,
    pricing,
    maxUsesPerAssignment: 2,
  };
}

const parser: AtlasControllerParserImplementation = {
  artifactHash: PARSER_HASH,
  parseResponseBody: (body) => {
    const text = typeof body === "string" ? body : new TextDecoder().decode(body);
    const envelope = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = envelope.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return {
        disposition: "no_candidate",
        dispositionReason: "missing_assistant_content",
        normalizedSemanticCandidates: [],
      };
    }
    let payload: unknown;
    try {
      payload = JSON.parse(content);
    } catch {
      return {
        disposition: "no_candidate",
        dispositionReason: "assistant_json_parse_failure",
        normalizedSemanticCandidates: [],
      };
    }
    const questions = payload && typeof payload === "object" &&
      Array.isArray((payload as { questions?: unknown }).questions)
      ? (payload as { questions: unknown[] }).questions.filter(
          (value) => value !== null && typeof value === "object",
        )
      : [];
    return questions.length > 0
      ? {
          disposition: "parsed",
          dispositionReason: "full_questions_observed",
          normalizedSemanticCandidates: questions.map(stable),
        }
      : {
          disposition: "no_candidate",
          dispositionReason: "no_full_question",
          normalizedSemanticCandidates: [],
        };
  },
};

async function fixture(
  specs: EntrySpec[],
  rootEntryId: string,
  repeatRootEntryId?: string,
) {
  const root = await mkdtemp(join(tmpdir(), "qgen-callsite-adapter-"));
  const registryPath = join(root, "registry.json");
  const storePath = join(root, "budget.sqlite");
  const experimentId = "EXP-CALLSITE";
  const phaseId = "phase";
  const batchId = "batch";
  const operationId = `${experimentId}:${phaseId}:${batchId}:assignment-001`;
  const assignmentId = "assignment-001";
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
          apiCandidateBudget: 20,
          maxPhysicalProviderCalls: 20,
          maxCostUsd: 20,
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
    idempotencyKey: "reserve-callsite-batch",
    candidateSlots: 20,
    maxProviderCalls: 20,
    maxCostUsd: 20,
  }, { apply: true });
  const contract = sealAtlasControllerAssignmentContract({
    contractId: "callsite-envelope",
    maxPhysicalCalls: 10,
    maxCandidateOutputs: 10,
    maxCostUsd: 10,
  });
  const transitions: AtlasControllerStageTransition[] = [];
  for (const spec of specs) {
    if (spec.exact) {
      transitions.push({
        transitionId: `root-${spec.entryId}`,
        fromEntryId: null,
        toEntryId: spec.entryId,
      });
    } else {
      transitions.push(...(spec.allowedParentEntryIds ?? []).map((parent, index) => ({
          transitionId: `${parent}-to-${spec.entryId}-${index}`,
          fromEntryId: parent,
          toEntryId: spec.entryId,
        })));
    }
  }
  const registry = sealAtlasControllerRegistry({
    schemaVersion: 2,
    controllerId: "callsite-adapter-controller",
    operationIdPrefix: `${experimentId}:${phaseId}:${batchId}:`,
    experimentId,
    phaseId,
    batchId,
    entries: specs.map(registryEntry),
    assignmentContracts: [contract],
    transitions,
  });
  const controller = new DurableAtlasResearchController({
    store,
    registry,
    parsers: { [PARSER_ID]: parser },
    pricingSnapshots: { "callsite-price-20260715": pricingSnapshot },
    now: () => Date.parse("2026-07-15T12:00:00.000Z"),
  });
  const childEntryIds = Object.fromEntries(
    specs.filter((spec) => !spec.exact).map((spec) => [spec.stage, spec.entryId]),
  ) as Partial<Record<QuestionGenerationResearchStageKey, string>>;
  const adapter = new QuestionGenerationCallsiteAdapter({
    runtimeId: "callsite-runtime",
    controller,
    registry,
    expectedEndpoint: ENDPOINT,
    operationId,
    assignmentId,
    assignmentContractId: contract.contractId,
    rootEntryId,
    repeatRootEntryId,
    childEntryIds,
  });
  return {
    adapter,
    controller,
    store,
    operationId,
    assignmentId,
    close: async () => {
      store.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

function providerResponse(content: unknown, ordinal: number): Response {
  return new Response(JSON.stringify({
    id: `generation-${ordinal}`,
    model: MODEL,
    provider: "Google",
    choices: [{
      message: { role: "assistant", content: JSON.stringify(content) },
      finish_reason: "stop",
    }],
    usage: {
      prompt_tokens: 20,
      completion_tokens: 10,
      total_tokens: 30,
      cost: 0.001,
    },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

async function returnedPayload(response: Response): Promise<Record<string, unknown>> {
  const envelope = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  return JSON.parse(envelope.choices[0].message.content) as Record<string, unknown>;
}

test("zero-network root-to-repair callsite binds the actual parent and finalizes both candidates", async () => {
  const rootSpec: EntrySpec = {
    entryId: "root-structured",
    stage: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
    purpose: "candidate",
    candidateCount: 1,
    exact: true,
    prompt: "root prompt",
  };
  const repairSpec: EntrySpec = {
    entryId: "repair-child",
    stage: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_CANDIDATE_REPAIR,
    purpose: "candidate",
    candidateCount: 1,
    exact: false,
    prompt: "repair prompt",
    allowedParentEntryIds: [rootSpec.entryId],
  };
  const fx = await fixture([rootSpec, repairSpec], rootSpec.entryId);
  let networkCalls = 0;
  const outputs = [
    { questions: [{ id: "q-root", text: "draft" }] },
    { questions: [{ id: "q-repaired", text: "fixed" }] },
  ];
  const dispatcher = createAtlasResearchFetchDispatcher(async () =>
    providerResponse(outputs[networkCalls], ++networkCalls));
  const uninstall = installAtlasResearchFetchController(fx.controller);
  try {
    const result = await runWithQuestionGenerationResearchRuntime(fx.adapter, async () =>
      runQuestionGenerationResearchOperation({
        rootStage: {
          key: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
          purpose: "candidate",
        },
        subType: "BLANK_INFERENCE",
        difficulty: "KILLER",
        generationPlan: "STANDARD",
        qualityMode: "strict",
      }, async () => {
        const rootPayload = await returnedPayload(await dispatcher(ENDPOINT, {
          method: "POST",
          body: requestBody(rootSpec),
        }));
        const rootQuestion = (rootPayload.questions as Record<string, unknown>[])[0];
        await observeQuestionGenerationResearchCandidates([rootQuestion]);
        const repaired = await runQuestionGenerationResearchStage({
          key: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_CANDIDATE_REPAIR,
          purpose: "candidate",
          derivationParentValue: rootQuestion,
        }, async () => {
          const payload = await returnedPayload(await dispatcher(ENDPOINT, {
            method: "POST",
            body: requestBody(repairSpec),
          }));
          return (payload.questions as Record<string, unknown>[])[0];
        });
        await observeQuestionGenerationResearchCandidates([repaired]);
        await decideQuestionGenerationResearchCandidate(rootQuestion, "parsed_rejected");
        await decideQuestionGenerationResearchCandidate(repaired, "parsed_accepted");
        return repaired;
      }));
    assert.equal(result.id, "q-repaired");
    assert.equal(networkCalls, 2);
    const recovery = fx.controller.recoverAssignment(fx.assignmentId);
    assert.equal(recovery.assignment.state, "closed");
    assert.equal(recovery.calls.length, 2);
    assert.equal(
      recovery.calls[1].contract.parentPhysicalCallId,
      recovery.calls[0].call.callId,
    );
    assert.deepEqual(
      recovery.calls.flatMap((call) => call.candidateSlots.map((slot) => slot.outcome)),
      ["parsed_rejected", "parsed_accepted"],
    );
  } finally {
    uninstall();
    await fx.close();
  }
});

test("slice/find observation rejects every parser-visible but unreturned semantic candidate", async () => {
  const rootSpec: EntrySpec = {
    entryId: "root-two-candidates",
    stage: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
    purpose: "candidate",
    candidateCount: 2,
    exact: true,
    prompt: "two fixed questions",
  };
  const fx = await fixture([rootSpec], rootSpec.entryId);
  const dispatcher = createAtlasResearchFetchDispatcher(async () => providerResponse({
    questions: [
      { id: "kept", text: "first" },
      { id: "trimmed", text: "second" },
    ],
  }, 1));
  const uninstall = installAtlasResearchFetchController(fx.controller);
  try {
    await runWithQuestionGenerationResearchRuntime(fx.adapter, async () =>
      runQuestionGenerationResearchOperation({
        rootStage: {
          key: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
          purpose: "candidate",
        },
        subType: "BLANK_INFERENCE",
        difficulty: "KILLER",
        generationPlan: "STANDARD",
        qualityMode: "strict",
      }, async () => {
        const payload = await returnedPayload(await dispatcher(ENDPOINT, {
          method: "POST",
          body: requestBody(rootSpec),
        }));
        const kept = (payload.questions as Record<string, unknown>[]).slice(0, 1);
        await observeQuestionGenerationResearchCandidates(kept);
        await decideQuestionGenerationResearchCandidate(kept[0], "parsed_accepted");
      }));
    const recovery = fx.controller.recoverAssignment(fx.assignmentId);
    const byOutputIndex = [...recovery.calls[0].candidateSlots].sort(
      (left, right) => (left.outputIndex ?? -1) - (right.outputIndex ?? -1),
    );
    assert.deepEqual(
      byOutputIndex.map((slot) => slot.outcome),
      ["parsed_accepted", "parsed_rejected"],
    );
    assert.ok(recovery.calls[0].candidateSlots.every((slot) => slot.state === "finished"));
  } finally {
    uninstall();
    await fx.close();
  }
});

test("unknown derivation value is rejected before child network while the prior candidate terminates", async () => {
  const rootSpec: EntrySpec = {
    entryId: "root-parent",
    stage: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
    purpose: "candidate",
    candidateCount: 1,
    exact: true,
    prompt: "parent",
  };
  const solverSpec: EntrySpec = {
    entryId: "solver-child",
    stage: QUESTION_GENERATION_RESEARCH_STAGES.GRAMMAR_SOLVER,
    purpose: "evaluation",
    candidateCount: 0,
    exact: false,
    prompt: "solver",
    allowedParentEntryIds: [rootSpec.entryId],
  };
  const fx = await fixture([rootSpec, solverSpec], rootSpec.entryId);
  let networkCalls = 0;
  const dispatcher = createAtlasResearchFetchDispatcher(async () => {
    networkCalls += 1;
    return providerResponse({ questions: [{ id: "parent", text: "draft" }] }, networkCalls);
  });
  const uninstall = installAtlasResearchFetchController(fx.controller);
  try {
    await runWithQuestionGenerationResearchRuntime(fx.adapter, async () =>
      runQuestionGenerationResearchOperation({
        rootStage: {
          key: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
          purpose: "candidate",
        },
        subType: "GRAMMAR_ERROR",
        difficulty: "KILLER",
        generationPlan: "STANDARD",
        qualityMode: "strict",
      }, async () => {
        const payload = await returnedPayload(await dispatcher(ENDPOINT, {
          method: "POST",
          body: requestBody(rootSpec),
        }));
        const candidate = (payload.questions as Record<string, unknown>[])[0];
        await observeQuestionGenerationResearchCandidates([candidate]);
        await assert.rejects(
          () => Promise.resolve(runQuestionGenerationResearchStage({
            key: QUESTION_GENERATION_RESEARCH_STAGES.GRAMMAR_SOLVER,
            purpose: "evaluation",
            derivationParentValue: { ...candidate },
          }, () => dispatcher(ENDPOINT, {
            method: "POST",
            body: requestBody(solverSpec),
          }))),
          /no trusted producer/,
        );
        await decideQuestionGenerationResearchCandidate(candidate, "parsed_rejected");
      }));
    assert.equal(networkCalls, 1);
    const recovery = fx.controller.recoverAssignment(fx.assignmentId);
    assert.equal(recovery.calls.length, 1);
    assert.equal(recovery.calls[0].candidateSlots[0].outcome, "parsed_rejected");
  } finally {
    uninstall();
    await fx.close();
  }
});

test("ladder give-up can enter the legacy structured child and preserves parent lineage", async () => {
  const designSpec: EntrySpec = {
    entryId: "ladder-answer-root",
    stage: QUESTION_GENERATION_RESEARCH_STAGES.GRAMMAR_LADDER_ANSWER_ONLY,
    purpose: "design",
    candidateCount: 0,
    exact: true,
    prompt: "answer design",
  };
  const legacySpec: EntrySpec = {
    entryId: "legacy-structured-child",
    stage: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
    purpose: "candidate",
    candidateCount: 1,
    exact: false,
    prompt: "legacy fallback",
    allowedParentEntryIds: [designSpec.entryId],
  };
  const fx = await fixture([designSpec, legacySpec], designSpec.entryId);
  let networkCalls = 0;
  const dispatcher = createAtlasResearchFetchDispatcher(async () => {
    networkCalls += 1;
    return networkCalls === 1
      ? providerResponse({ design: "answer site" }, networkCalls)
      : providerResponse({ questions: [{ id: "legacy", text: "fallback" }] }, networkCalls);
  });
  const uninstall = installAtlasResearchFetchController(fx.controller);
  try {
    await runWithQuestionGenerationResearchRuntime(fx.adapter, async () =>
      runQuestionGenerationResearchOperation({
        rootStage: {
          key: QUESTION_GENERATION_RESEARCH_STAGES.GRAMMAR_LADDER_ANSWER_ONLY,
          purpose: "design",
        },
        subType: "GRAMMAR_ERROR",
        difficulty: "KILLER",
        generationPlan: "PREMIUM",
        qualityMode: "strict",
      }, async () => {
        await dispatcher(ENDPOINT, { method: "POST", body: requestBody(designSpec) });
        const fallback = await runQuestionGenerationResearchStage({
          key: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
          purpose: "candidate",
        }, async () => {
          const payload = await returnedPayload(await dispatcher(ENDPOINT, {
            method: "POST",
            body: requestBody(legacySpec),
          }));
          return (payload.questions as Record<string, unknown>[])[0];
        });
        await observeQuestionGenerationResearchCandidates([fallback]);
        await decideQuestionGenerationResearchCandidate(fallback, "parsed_accepted");
      }));
    const recovery = fx.controller.recoverAssignment(fx.assignmentId);
    assert.equal(recovery.assignment.state, "closed");
    assert.equal(recovery.calls[1].contract.controllerEntryId, legacySpec.entryId);
    assert.equal(
      recovery.calls[1].contract.parentPhysicalCallId,
      recovery.calls[0].call.callId,
    );
  } finally {
    uninstall();
    await fx.close();
  }
});

test("operation exception terminally rejects an observed ladder candidate", async () => {
  const rootSpec: EntrySpec = {
    entryId: "ladder-candidate-root",
    stage: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
    purpose: "candidate",
    candidateCount: 1,
    exact: true,
    prompt: "candidate before regeneration",
  };
  const fx = await fixture([rootSpec], rootSpec.entryId);
  const dispatcher = createAtlasResearchFetchDispatcher(async () => providerResponse({
    questions: [{ id: "prior", text: "must terminate" }],
  }, 1));
  const uninstall = installAtlasResearchFetchController(fx.controller);
  try {
    await assert.rejects(
      () => runWithQuestionGenerationResearchRuntime(fx.adapter, async () =>
        runQuestionGenerationResearchOperation({
          rootStage: {
            key: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
            purpose: "candidate",
          },
          subType: "GRAMMAR_ERROR",
          difficulty: "KILLER",
          generationPlan: "PREMIUM",
          qualityMode: "strict",
        }, async () => {
          const payload = await returnedPayload(await dispatcher(ENDPOINT, {
            method: "POST",
            body: requestBody(rootSpec),
          }));
          const prior = (payload.questions as Record<string, unknown>[])[0];
          await observeQuestionGenerationResearchCandidates([prior]);
          throw new Error("hard regeneration finalize failed");
        })),
      /hard regeneration finalize failed/,
    );
    const recovery = fx.controller.recoverAssignment(fx.assignmentId);
    assert.equal(recovery.assignment.state, "closed");
    assert.equal(recovery.calls[0].candidateSlots[0].state, "finished");
    assert.equal(recovery.calls[0].candidateSlots[0].outcome, "parsed_rejected");
  } finally {
    uninstall();
    await fx.close();
  }
});

test("production outer retries share one admitted assignment and use a derived repeat root", async () => {
  const rootSpec: EntrySpec = {
    entryId: "first-attempt-root",
    stage: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
    purpose: "candidate",
    candidateCount: 1,
    exact: true,
    prompt: "first attempt",
  };
  const retrySpec: EntrySpec = {
    entryId: "derived-attempt-retry",
    stage: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
    purpose: "candidate",
    candidateCount: 1,
    exact: false,
    prompt: "corrective retry",
    allowedParentEntryIds: [rootSpec.entryId],
  };
  const fx = await fixture([rootSpec, retrySpec], rootSpec.entryId, retrySpec.entryId);
  let networkCalls = 0;
  const dispatcher = createAtlasResearchFetchDispatcher(async () => {
    networkCalls += 1;
    return providerResponse({
      questions: [{
        id: networkCalls === 1 ? "rejected-first" : "accepted-retry",
        text: `attempt-${networkCalls}`,
      }],
    }, networkCalls);
  });
  const uninstall = installAtlasResearchFetchController(fx.controller);
  const operation = {
    rootStage: {
      key: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
      purpose: "candidate" as const,
    },
    subType: "BLANK_INFERENCE",
    difficulty: "KILLER",
    generationPlan: "STANDARD",
    qualityMode: "strict",
  };
  try {
    await runWithQuestionGenerationResearchRuntime(fx.adapter, async () => {
      await runQuestionGenerationResearchOperation(operation, async () => {
        const payload = await returnedPayload(await dispatcher(ENDPOINT, {
          method: "POST",
          body: requestBody(rootSpec),
        }));
        const candidate = (payload.questions as Record<string, unknown>[])[0];
        await observeQuestionGenerationResearchCandidates([candidate]);
        await decideQuestionGenerationResearchCandidate(candidate, "parsed_rejected");
      });
      await runQuestionGenerationResearchOperation(operation, async () => {
        const payload = await returnedPayload(await dispatcher(ENDPOINT, {
          method: "POST",
          body: requestBody(retrySpec),
        }));
        const candidate = (payload.questions as Record<string, unknown>[])[0];
        await observeQuestionGenerationResearchCandidates([candidate]);
        await decideQuestionGenerationResearchCandidate(candidate, "parsed_accepted");
      });
    });
    const recovery = fx.controller.recoverAssignment(fx.assignmentId);
    assert.equal(recovery.assignment.state, "closed");
    assert.equal(recovery.calls.length, 2);
    assert.equal(recovery.calls[1].contract.controllerEntryId, retrySpec.entryId);
    assert.equal(
      recovery.calls[1].contract.parentPhysicalCallId,
      recovery.calls[0].call.callId,
    );
    assert.deepEqual(
      recovery.calls.flatMap((call) => call.candidateSlots.map((slot) => slot.outcome)),
      ["parsed_rejected", "parsed_accepted"],
    );
  } finally {
    uninstall();
    await fx.close();
  }
});

test("strict-schema failure cannot silently downgrade the research candidate path to prompt JSON", async () => {
  const rootSpec: EntrySpec = {
    entryId: "strict-before-prompt-json",
    stage: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
    purpose: "candidate",
    candidateCount: 1,
    exact: true,
    prompt: "strict request that the provider rejects",
  };
  const fallbackSpec: EntrySpec = {
    entryId: "prompt-json-fallback-blocked",
    stage: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_PROMPT_JSON_FALLBACK,
    purpose: "candidate",
    candidateCount: 1,
    exact: false,
    prompt: "unstructured prompt JSON fallback",
    allowedParentEntryIds: [rootSpec.entryId],
  };
  const fx = await fixture([rootSpec, fallbackSpec], rootSpec.entryId);
  let delegateCalls = 0;
  const dispatcher = createAtlasResearchFetchDispatcher(async () => {
    delegateCalls += 1;
    return new Response(JSON.stringify({
      error: { message: "simulated strict-schema rejection" },
      usage: {
        prompt_tokens: 20,
        completion_tokens: 0,
        total_tokens: 20,
        cost: 0.001,
      },
    }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  });
  const uninstall = installAtlasResearchFetchController(fx.controller);
  try {
    await runWithQuestionGenerationResearchRuntime(fx.adapter, async () =>
      runQuestionGenerationResearchOperation({
        rootStage: {
          key: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
          purpose: "candidate",
        },
        subType: "BLANK_INFERENCE",
        difficulty: "KILLER",
        generationPlan: "STANDARD",
        qualityMode: "strict",
      }, async () => {
        const strictResponse = await dispatcher(ENDPOINT, {
          method: "POST",
          body: requestBody(rootSpec),
        });
        await strictResponse.text();

        await assert.rejects(
          async () => runQuestionGenerationResearchStage({
            key: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_PROMPT_JSON_FALLBACK,
            purpose: "candidate",
          }, () => dispatcher(ENDPOINT, {
            method: "POST",
            body: JSON.stringify({
              model: MODEL,
              messages: [{ role: "user", content: fallbackSpec.prompt }],
              max_output_tokens: 128,
            }),
          })),
          (error: unknown) =>
            error instanceof Error &&
            "code" in error &&
            (error as Error & { code: string }).code === "CONTROLLER_REGISTRY_REJECTED",
        );
      }));

    // Only the strict request reached the mock provider. The fallback is an
    // explicit ITT failure, not an uncounted candidate-producing call.
    assert.equal(delegateCalls, 1);
    const recovery = fx.controller.recoverAssignment(fx.assignmentId);
    assert.equal(recovery.assignment.state, "closed");
    assert.equal(recovery.calls.length, 1);
    assert.equal(recovery.calls[0].candidateSlots[0].outcome, "no_candidate");
  } finally {
    uninstall();
    await fx.close();
  }
});

test("schema parse failure and transport timeout consume terminal candidate dispositions", async (t) => {
  await t.test("schema/parser failure becomes no_candidate", async () => {
    const rootSpec: EntrySpec = {
      entryId: "parse-failure-root",
      stage: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
      purpose: "candidate",
      candidateCount: 1,
      exact: true,
      prompt: "malformed response",
    };
    const fx = await fixture([rootSpec], rootSpec.entryId);
    const dispatcher = createAtlasResearchFetchDispatcher(async () => new Response(JSON.stringify({
      id: "generation-malformed",
      model: MODEL,
      provider: "Google",
      choices: [{ message: { role: "assistant", content: "{broken" } }],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 3,
        total_tokens: 23,
        cost: 0.001,
      },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const uninstall = installAtlasResearchFetchController(fx.controller);
    try {
      await assert.rejects(
        () => runWithQuestionGenerationResearchRuntime(fx.adapter, async () =>
          runQuestionGenerationResearchOperation({
            rootStage: {
              key: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
              purpose: "candidate",
            },
            subType: "BLANK_INFERENCE",
            difficulty: "KILLER",
            generationPlan: "STANDARD",
            qualityMode: "strict",
          }, async () => {
            await returnedPayload(await dispatcher(ENDPOINT, {
              method: "POST",
              body: requestBody(rootSpec),
            }));
          })),
        /Unexpected token|JSON/,
      );
      const recovery = fx.controller.recoverAssignment(fx.assignmentId);
      assert.equal(recovery.assignment.state, "closed");
      assert.equal(recovery.calls[0].candidateSlots[0].state, "finished");
      assert.equal(recovery.calls[0].candidateSlots[0].outcome, "no_candidate");
    } finally {
      uninstall();
      await fx.close();
    }
  });

  await t.test("transport timeout becomes unknown_after_send", async () => {
    const rootSpec: EntrySpec = {
      entryId: "timeout-root",
      stage: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
      purpose: "candidate",
      candidateCount: 1,
      exact: true,
      prompt: "timeout",
    };
    const fx = await fixture([rootSpec], rootSpec.entryId);
    const timeout = new DOMException("simulated timeout", "TimeoutError");
    const dispatcher = createAtlasResearchFetchDispatcher(async () => {
      throw timeout;
    });
    const uninstall = installAtlasResearchFetchController(fx.controller);
    try {
      await assert.rejects(
        () => runWithQuestionGenerationResearchRuntime(fx.adapter, async () =>
          runQuestionGenerationResearchOperation({
            rootStage: {
              key: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
              purpose: "candidate",
            },
            subType: "BLANK_INFERENCE",
            difficulty: "KILLER",
            generationPlan: "STANDARD",
            qualityMode: "strict",
          }, () => dispatcher(ENDPOINT, {
            method: "POST",
            body: requestBody(rootSpec),
          }))),
        (error) => error === timeout,
      );
      const recovery = fx.controller.recoverAssignment(fx.assignmentId);
      // Unknown-after-send has terminal candidate accounting but deliberately
      // cannot close until external billing reconciliation makes usage final.
      assert.equal(recovery.assignment.state, "open");
      assert.equal(recovery.calls[0].candidateSlots[0].state, "finished");
      assert.equal(recovery.calls[0].candidateSlots[0].outcome, "unknown_after_send");
    } finally {
      uninstall();
      await fx.close();
    }
  });
});
