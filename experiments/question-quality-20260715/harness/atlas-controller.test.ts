import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  AtlasResearchBoundaryError,
  type AtlasResearchLeaseRequest,
  type AtlasResearchProvenance,
  type AtlasResearchWireRequestFacts,
} from "@/lib/atlas-research-fetch-boundary";

import {
  deriveAtlasControllerPricingSnapshotProof,
  DurableAtlasResearchController,
  sealAtlasControllerAssignmentContract,
  sealAtlasControllerPricingContract,
  sealAtlasControllerRegistry,
  type AtlasControllerParserImplementation,
  type AtlasControllerRegistryEntryDraft,
} from "./atlas-controller";
import { openTestBudgetStore, type BudgetStore } from "./ledger";

process.env.QUESTION_QUALITY_BUDGET_GUARD_TEST_MODE = "1";

const sha = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
const stable = (value: unknown): string => {
  const normalize = (child: unknown): unknown => {
    if (Array.isArray(child)) return child.map(normalize);
    if (child && typeof child === "object") {
      return Object.fromEntries(Object.entries(child as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalize(nested)]));
    }
    return child;
  };
  return JSON.stringify(normalize(value));
};

const PRICING_SNAPSHOT_ID = "openrouter-max-20260715";
const pricingEndpoint = {
  provider: "Google",
  endpointName: "Google | google/gemini-3.5-flash-test",
  contextLength: 1_048_576,
  promptUsdPerToken: 0.0000015,
  completionUsdPerToken: 0.000009,
  overrides: [],
};
const pricingSnapshotContent = {
  schemaVersion: 1,
  fetchedAt: "2026-07-15T00:00:00.000Z",
  models: [{
    id: "google/gemini-3.5-flash",
    endpointRates: [pricingEndpoint],
  }],
};
const pricingSnapshot = {
  ...pricingSnapshotContent,
  snapshotSha256: sha(JSON.stringify(pricingSnapshotContent)),
};
const pricingProof = deriveAtlasControllerPricingSnapshotProof(
  PRICING_SNAPSHOT_ID,
  pricingSnapshot,
);
const flashPriceProof = pricingProof.models["google/gemini-3.5-flash"];

const HASH = {
  prompt: "1".repeat(64),
  schema: "2".repeat(64),
  gate: "3".repeat(64),
  policy: "4".repeat(64),
  passage: "5".repeat(64),
  endpoint: "6".repeat(64),
  body: "7".repeat(64),
  wirePrompt: "8".repeat(64),
  parser: "9".repeat(64),
  derivation: "c".repeat(64),
} as const;

const parserId = "full-question-v2";
const candidateAttestationHash = sha(stable({
  attestationId: parserId,
  candidatesPerCompletion: 1,
  parserArtifactHash: HASH.parser,
}));

const provenance: AtlasResearchProvenance = {
  requestedModel: "google/gemini-3.5-flash",
  effectiveModel: "google/gemini-3.5-flash",
  plan: "STANDARD",
  stage: "ordinary-structured-generation",
  promptHash: HASH.prompt,
  schemaHash: HASH.schema,
  gateHash: HASH.gate,
  ladderHash: null,
  policyHash: HASH.policy,
  corpus: {
    corpusId: "fixture-corpus",
    rowId: "row-001",
    passageHash: HASH.passage,
  },
  runnerVersion: "atlas-controller-test-v2",
  gitVersion: "deadbeef-dirty",
};

const candidateWire: AtlasResearchWireRequestFacts = {
  method: "POST",
  endpointOrigin: "https://openrouter.ai",
  endpointPath: "/api/v1/chat/completions",
  endpointHash: HASH.endpoint,
  wireBodyHash: HASH.body,
  requestBodyUtf8Bytes: 2_000,
  canonicalRequestHash: "d".repeat(64),
  wirePromptHash: HASH.wirePrompt,
  wireSchemaHash: HASH.schema,
  model: provenance.effectiveModel,
  completionCount: 1,
  stream: false,
  outputShape: "json-schema-object",
  structurallyFixedOutputsPerCompletion: 1,
  maxTokens: null,
  maxCompletionTokens: null,
  maxOutputTokens: 128,
};

const pricing = sealAtlasControllerPricingContract({
  inputUsdPer1M: flashPriceProof.maxInputUsdPer1M,
  outputUsdPer1M: flashPriceProof.maxOutputUsdPer1M,
  safetyMultiplier: 1.1,
  serverTokenOverheadUpperBound: 256,
  currency: "USD",
  proofKind: "maximum-allowed-provider-list-price",
  priceSnapshotId: PRICING_SNAPSHOT_ID,
  priceSnapshotHash: pricingSnapshot.snapshotSha256,
  providerAllowlistHash: flashPriceProof.providerAllowlistHash,
  validAt: "2026-07-15T00:00:00.000Z",
  validThrough: "2026-07-16T00:00:00.000Z",
  basis: "Pinned maximum list price across the frozen provider allow-list",
});

function entry(overrides: Partial<AtlasControllerRegistryEntryDraft> = {}): AtlasControllerRegistryEntryDraft {
  return {
    entryId: "candidate-entry",
    purpose: "candidate",
    candidateProducing: true,
    provenance,
    wire: {
      endpointHash: candidateWire.endpointHash,
      requestMode: "exact",
      wireBodyHash: candidateWire.wireBodyHash,
      wirePromptHash: candidateWire.wirePromptHash,
      wireSchemaHash: candidateWire.wireSchemaHash,
      outputShape: candidateWire.outputShape,
      structurallyFixedOutputsPerCompletion: 1,
      completionCount: 1,
      maxOutputTokens: 128,
      maxRequestBodyUtf8Bytes: 2_000,
      derivationContract: null,
    },
    candidateContract: {
      attestationId: parserId,
      attestationHash: candidateAttestationHash,
      candidatesPerCompletion: 1,
      parserArtifactHash: HASH.parser,
    },
    pricing,
    maxUsesPerAssignment: 4,
    ...overrides,
  };
}

const assignmentContract = sealAtlasControllerAssignmentContract({
  contractId: "ordinary-max-envelope",
  maxPhysicalCalls: 8,
  maxCandidateOutputs: 4,
  maxCostUsd: 10,
});

const defaultParser: AtlasControllerParserImplementation = {
  artifactHash: HASH.parser,
  parseResponseBody: (body) => {
    const text = typeof body === "string" ? body : new TextDecoder().decode(body);
    const parsed = JSON.parse(text) as { question?: unknown };
    return parsed.question
      ? {
          disposition: "parsed" as const,
          dispositionReason: "semantic_full_question_observed",
          normalizedSemanticCandidates: [stable(parsed)],
        }
      : {
          disposition: "no_candidate" as const,
          dispositionReason: "no_semantic_full_question",
          normalizedSemanticCandidates: [],
        };
  },
};

async function fixture(options: {
  parser?: AtlasControllerParserImplementation;
  entries?: AtlasControllerRegistryEntryDraft[];
  transitions?: Array<{ transitionId: string; fromEntryId: string | null; toEntryId: string }>;
  admit?: boolean;
  now?: string;
  pricingEvidence?: unknown;
  candidateBudget?: number;
  maxPhysicalProviderCalls?: number;
  maxCostUsd?: number;
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "atlas-controller-v2-"));
  const registryPath = join(root, "registry.json");
  const storePath = join(root, "budget.sqlite");
  await writeFile(
    registryPath,
    `${JSON.stringify({
      schemaVersion: 1,
      status: "preregistering",
      registeredExperiments: [{
        id: "EXP-A",
        status: "registered",
        phases: [{
          id: "default",
          status: "registered",
          apiCandidateBudget: options.candidateBudget ?? 4,
          maxPhysicalProviderCalls: options.maxPhysicalProviderCalls ?? 8,
          maxCostUsd: options.maxCostUsd ?? 10,
        }],
      }],
    }, null, 2)}\n`,
    "utf8",
  );
  const store = openTestBudgetStore(storePath, registryPath);
  store.reserveBatch(
    {
      experimentId: "EXP-A",
      phaseId: "default",
      batchId: "batch-ctrl",
      idempotencyKey: "reserve:EXP-A:default:batch-ctrl",
      candidateSlots: options.candidateBudget ?? 4,
      maxProviderCalls: options.maxPhysicalProviderCalls ?? 8,
      maxCostUsd: options.maxCostUsd ?? 10,
    },
    { apply: true },
  );
  const entries = options.entries ?? [entry()];
  const sealed = sealAtlasControllerRegistry({
    schemaVersion: 2,
    controllerId: "atlas-controller-test",
    operationIdPrefix: "EXP-A:default:batch-ctrl:",
    experimentId: "EXP-A",
    phaseId: "default",
    batchId: "batch-ctrl",
    entries,
    assignmentContracts: [assignmentContract],
    transitions: options.transitions ?? [{
      transitionId: "root-candidate",
      fromEntryId: null,
      toEntryId: "candidate-entry",
    }],
  });
  const makeController = (targetStore: BudgetStore) => new DurableAtlasResearchController({
    store: targetStore,
    registry: sealed,
    parsers: { [parserId]: options.parser ?? defaultParser },
    pricingSnapshots: { [PRICING_SNAPSHOT_ID]: options.pricingEvidence ?? pricingSnapshot },
    now: () => Date.parse(options.now ?? "2026-07-15T12:00:00.000Z"),
  });
  let controller: DurableAtlasResearchController;
  try {
    controller = makeController(store);
    if (options.admit !== false) {
      controller.admitAssignment({
        operationId: "EXP-A:default:batch-ctrl:assignment-001",
        assignmentId: "assignment-001",
        contractId: assignmentContract.contractId,
      });
    }
  } catch (error) {
    store.close();
    await rm(root, { recursive: true, force: true });
    throw error;
  }
  return {
    root,
    registryPath,
    storePath,
    sealed,
    store,
    controller,
    makeController,
    close: async (targetStore: BudgetStore = store) => {
      targetStore.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

function leaseRequest(
  ordinal: number,
  overrides: Partial<AtlasResearchLeaseRequest> = {},
): AtlasResearchLeaseRequest {
  const operationId = "EXP-A:default:batch-ctrl:assignment-001";
  return {
    operationId,
    physicalCallId: `${operationId}:http:${ordinal}`,
    physicalOrdinal: ordinal,
    purpose: "candidate",
    parentPhysicalCallId: null,
    derivationIntent: null,
    candidateOutputs: 1,
    provenance,
    request: candidateWire,
    ...overrides,
  };
}

async function settleSuccessful(
  controller: DurableAtlasResearchController,
  request: AtlasResearchLeaseRequest,
  responseBody: string,
) {
  const lease = controller.preFetchLease(request);
  await observeSuccessful(controller, request, lease, responseBody);
  return lease;
}

async function observeSuccessful(
  controller: DurableAtlasResearchController,
  request: AtlasResearchLeaseRequest,
  lease: { leaseId: string },
  responseBody: string,
) {
  await controller.observeClone(lease, {
    operationId: request.operationId,
    physicalCallId: request.physicalCallId,
    physicalOrdinal: request.physicalOrdinal,
    parseState: "json",
    responseBodyHash: sha(responseBody),
    generationId: `generation-${request.physicalOrdinal}`,
    servedModel: provenance.effectiveModel,
    upstreamProvider: "Google",
    promptTokens: 300,
    completionTokens: 80,
    totalTokens: 380,
    costState: "reported",
    costUsd: 0.002,
    rawUsageCostUsd: 0.002,
    upstreamInferenceCostUsd: null,
    capturedResponseBody: new TextEncoder().encode(responseBody),
  });
  await controller.observeResponse(lease, {
    operationId: request.operationId,
    physicalCallId: request.physicalCallId,
    physicalOrdinal: request.physicalOrdinal,
    status: 200,
    ok: true,
    terminalKind: "http-response",
  });
}

function recordDirectClone(
  store: BudgetStore,
  request: AtlasResearchLeaseRequest,
  responseBody: string,
  suffix: string,
) {
  const evidence = {
    operationId: request.operationId,
    physicalCallId: request.physicalCallId,
    physicalOrdinal: request.physicalOrdinal,
    parseState: "json",
    responseBodyHash: sha(responseBody),
    generationId: `generation-${suffix}`,
    servedModel: provenance.effectiveModel,
    upstreamProvider: "Google",
    promptTokens: 300,
    completionTokens: 80,
    totalTokens: 380,
    costState: "reported",
    costUsd: 0.002,
    rawUsageCostUsd: 0.002,
    upstreamInferenceCostUsd: null,
  };
  const responseBodyBytes = new TextEncoder().encode(responseBody);
  store.recordControllerResponseBody({
    idempotencyKey: `test:response-body:${suffix}`,
    callId: request.physicalCallId,
    responseBodyHash: evidence.responseBodyHash,
    responseBody: responseBodyBytes,
  }, { apply: true });
  const evidenceJson = stable(evidence);
  store.recordControllerCloneEvidence({
    idempotencyKey: `test:clone:${suffix}`,
    callId: request.physicalCallId,
    responseBodyHash: evidence.responseBodyHash,
    evidenceJson,
    evidenceHash: sha(evidenceJson),
  }, { apply: true });
}

function recordDirectHttpTerminal(
  store: BudgetStore,
  request: AtlasResearchLeaseRequest,
  suffix: string,
) {
  const evidence = {
    operationId: request.operationId,
    physicalCallId: request.physicalCallId,
    physicalOrdinal: request.physicalOrdinal,
    status: 200,
    ok: true,
    terminalKind: "http-response",
  };
  const evidenceJson = stable(evidence);
  store.recordControllerTerminalEvidence({
    idempotencyKey: `test:terminal:${suffix}`,
    callId: request.physicalCallId,
    terminalKind: "http-response",
    evidenceJson,
    evidenceHash: sha(evidenceJson),
  }, { apply: true });
}

test("whole-assignment admission, durable evidence, and response-bound parser close cleanly", async () => {
  const fx = await fixture();
  try {
    const responseBody = '{"question":"normalized"}';
    const request = leaseRequest(1);
    assert.throws(
      () => fx.controller.preFetchLease({
        ...request,
        request: { ...request.request, requestBodyUtf8Bytes: 2_001 },
      }),
      (error: unknown) =>
        error instanceof AtlasResearchBoundaryError &&
        error.code === "CONTROLLER_REGISTRY_REJECTED",
    );
    const attestation = fx.controller.attestCandidateContract({
      scope: {
        operationId: request.operationId,
        purpose: "candidate",
        expectedEndpoint: "https://openrouter.ai/api/v1/chat/completions",
        expectedCandidateOutputs: 1,
        candidateContract: {
          attestationId: parserId,
          attestationHash: candidateAttestationHash,
          expectedCandidatesPerCompletion: 1,
        },
        parentPhysicalCallId: null,
        derivationIntent: null,
        provenance,
      },
      request: candidateWire,
    });
    assert.equal(attestation.candidatesPerCompletion, 1);
    await settleSuccessful(fx.controller, request, responseBody);
    const parsed = await fx.controller.recordOperationParseResult({
      operationId: request.operationId,
      producerPhysicalCallId: request.physicalCallId,
    });
    assert.equal(parsed.length, 1);
    fx.store.finalizeParsedCandidates({
      idempotencyKey: "finalize:parsed:test-1",
      decisions: [{ candidateSlotId: parsed[0].candidateSlotId, outcome: "parsed_rejected" }],
    }, { apply: true });
    const closed = await fx.controller.closeAssignment("assignment-001");
    assert.equal(closed.state, "closed");
    assert.equal(closed.usedCandidateOutputs, 1);
    assert.equal(closed.observedSemanticCandidates, 1);
    const recovery = fx.controller.recoverAssignment("assignment-001");
    assert(recovery.calls[0].terminalEvidenceJson);
    assert(recovery.calls[0].cloneEvidenceJson);
    assert(recovery.calls[0].parserEvidenceJson);
    const exported = await fx.store.exportArtifacts(join(fx.root, "redacted-export"));
    const snapshotText = await readFile(exported.snapshotPath, "utf8");
    const snapshot = JSON.parse(snapshotText) as {
      controllerResponseBodyMetadata: Array<{ response_body_hash: string; byte_length: number }>;
    };
    assert.equal(snapshotText.includes(responseBody), false);
    assert.equal(snapshot.controllerResponseBodyMetadata.length, 1);
    assert.equal(snapshot.controllerResponseBodyMetadata[0].response_body_hash, sha(responseBody));
    assert.equal(
      snapshot.controllerResponseBodyMetadata[0].byte_length,
      new TextEncoder().encode(responseBody).byteLength,
    );
    const adversarialDb = new DatabaseSync(fx.storePath);
    try {
      assert.throws(
        () => adversarialDb.prepare(
          "UPDATE controller_clone_evidence SET response_body_hash = ?",
        ).run("f".repeat(64)),
        /controller_clone_evidence is append-only/,
      );
      assert.throws(
        () => adversarialDb.prepare(
          "UPDATE controller_response_bodies SET response_body = X'00'",
        ).run(),
        /controller_response_bodies is append-only/,
      );
      assert.throws(
        () => adversarialDb.prepare(
          "DELETE FROM controller_registries WHERE registry_hash = ?",
        ).run(fx.sealed.registryHash),
        /controller_registries is append-only/,
      );
    } finally {
      adversarialDb.close();
    }
  } finally {
    await fx.close();
  }
});

test("response bytes cannot be substituted and parser overflow is durably quarantined", async () => {
  const overflowParser: AtlasControllerParserImplementation = {
    artifactHash: HASH.parser,
    parseResponseBody: () => ({
      disposition: "parsed",
      dispositionReason: "adversarial_overflow",
      normalizedSemanticCandidates: ["question-one", "question-two"],
    }),
  };
  const fx = await fixture({ parser: overflowParser });
  try {
    const responseBody = '{"question":"raw"}';
    const request = leaseRequest(1);
    const lease = fx.controller.preFetchLease(request);
    await assert.rejects(
      fx.controller.observeClone(lease, {
        operationId: request.operationId,
        physicalCallId: request.physicalCallId,
        physicalOrdinal: request.physicalOrdinal,
        parseState: "json",
        responseBodyHash: sha(responseBody),
        generationId: "forged-clone",
        servedModel: provenance.effectiveModel,
        upstreamProvider: "Google",
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        costState: "reported",
        costUsd: 0.001,
        rawUsageCostUsd: 0.001,
        upstreamInferenceCostUsd: null,
        capturedResponseBody: new TextEncoder().encode('{"question":"substituted"}'),
      }),
      (error: unknown) =>
        error instanceof AtlasResearchBoundaryError &&
        error.code === "CONTROLLER_CAPTURED_RESPONSE_MISMATCH",
    );
    await assert.rejects(
      observeSuccessful(fx.controller, request, lease, responseBody),
      (error: unknown) =>
        error instanceof AtlasResearchBoundaryError &&
        error.code === "CONTROLLER_SEMANTIC_OUTPUT_OVERFLOW",
    );
    const recovery = fx.controller.recoverAssignment("assignment-001");
    assert.equal(recovery.assignment.state, "quarantined");
    assert.equal(recovery.assignment.usedCandidateOutputs, 1);
    assert.equal(recovery.assignment.observedSemanticCandidates, 2);
    assert.equal(recovery.calls[0].candidateSlots.length, 1);
  } finally {
    await fx.close();
  }
});

test("schema-invalid raw output still counts when the frozen parser finds a full question", async () => {
  const semanticParser: AtlasControllerParserImplementation = {
    artifactHash: HASH.parser,
    parseResponseBody: (body) => ({
      disposition: "parsed",
      dispositionReason: "full_question_present_despite_schema_failure",
      normalizedSemanticCandidates: [
        stable({ raw: typeof body === "string" ? body : new TextDecoder().decode(body) }),
      ],
    }),
  };
  const fx = await fixture({ parser: semanticParser });
  try {
    const responseBody = '{"question":{"stem":"complete"},"schemaError":"missing_explanation"}';
    const request = leaseRequest(1);
    await settleSuccessful(fx.controller, request, responseBody);
    const parsed = await fx.controller.recordOperationParseResult({
      operationId: request.operationId,
      producerPhysicalCallId: request.physicalCallId,
    });
    assert.equal(parsed.length, 1);
    const recovery = fx.controller.recoverAssignment("assignment-001");
    assert.equal(recovery.assignment.usedCandidateOutputs, 1);
    assert.equal(recovery.assignment.observedSemanticCandidates, 1);
    fx.store.finalizeParsedCandidates({
      idempotencyKey: "finalize:schema-invalid-semantic",
      decisions: [{ candidateSlotId: parsed[0].candidateSlotId, outcome: "parsed_rejected" }],
    }, { apply: true });
    await fx.controller.closeAssignment("assignment-001");
  } finally {
    await fx.close();
  }
});

test("multiple successful SDK responses each receive an independent automatic disposition", async () => {
  const fx = await fixture();
  try {
    const first = leaseRequest(1);
    const second = leaseRequest(2);
    await settleSuccessful(fx.controller, first, '{"question":"first-success"}');
    await settleSuccessful(fx.controller, second, '{"question":"second-success"}');
    const recovery = fx.controller.recoverAssignment("assignment-001");
    assert.equal(recovery.calls.length, 2);
    assert(recovery.calls.every((call) => call.parserEvidenceJson !== null));
    assert(recovery.calls.every((call) => call.capturedResponseBody !== null));
    assert.equal(recovery.assignment.usedCandidateOutputs, 2);
    assert.equal(recovery.assignment.observedSemanticCandidates, 2);
    fx.store.finalizeParsedCandidates({
      idempotencyKey: "finalize:multiple-successes",
      decisions: recovery.calls.map((call) => ({
        candidateSlotId: call.candidateSlots[0].candidateSlotId,
        outcome: "parsed_rejected" as const,
      })),
    }, { apply: true });
    await fx.controller.closeAssignment("assignment-001");
  } finally {
    await fx.close();
  }
});

test("dynamic child receipt is controller-minted from intent, durable parent bytes, and actual wire", async () => {
  const derivedProvenance: AtlasResearchProvenance = {
    ...provenance,
    stage: "candidate-repair",
    promptHash: HASH.derivation,
  };
  const derivedEntry = entry({
    entryId: "derived-repair",
    provenance: derivedProvenance,
    wire: {
      ...entry().wire,
      requestMode: "derived",
      wireBodyHash: null,
      wirePromptHash: null,
      derivationContract: {
        contractId: "repair-from-parent-v1",
        artifactHash: HASH.derivation,
        allowedParentEntryIds: ["candidate-entry"],
      },
    },
    maxUsesPerAssignment: 1,
  });
  const fx = await fixture({
    entries: [entry({ maxUsesPerAssignment: 3 }), derivedEntry],
    transitions: [
      { transitionId: "root-candidate", fromEntryId: null, toEntryId: "candidate-entry" },
      { transitionId: "candidate-repair", fromEntryId: "candidate-entry", toEntryId: "derived-repair" },
    ],
  });
  try {
    const parentBody = '{"question":"parent"}';
    const parent = leaseRequest(1);
    await settleSuccessful(fx.controller, parent, parentBody);
    await fx.controller.recordOperationParseResult({
      operationId: parent.operationId,
      producerPhysicalCallId: parent.physicalCallId,
    });
    const derivedWire: AtlasResearchWireRequestFacts = {
      ...candidateWire,
      wireBodyHash: "e".repeat(64),
      canonicalRequestHash: "f".repeat(64),
      wirePromptHash: "0".repeat(64),
    };
    const derivationIntent = {
      contractId: "repair-from-parent-v1",
      artifactHash: HASH.derivation,
    };
    const receiptMaterial = {
      ...derivationIntent,
      parentPhysicalCallId: parent.physicalCallId,
      parentResponseBodyHash: sha(parentBody),
      derivedWireBodyHash: derivedWire.wireBodyHash,
      derivedWirePromptHash: derivedWire.wirePromptHash,
    };
    assert.throws(
      () => fx.controller.preFetchLease(leaseRequest(2, {
        parentPhysicalCallId: parent.physicalCallId,
        derivationIntent: {
          ...derivationIntent,
          artifactHash: "1".repeat(64),
        },
        provenance: {
          ...derivedProvenance,
          promptHash: derivedWire.wirePromptHash,
        },
        request: derivedWire,
      })),
      (error: unknown) =>
        error instanceof AtlasResearchBoundaryError &&
        error.code === "CONTROLLER_REGISTRY_REJECTED",
    );
    const child = leaseRequest(2, {
      parentPhysicalCallId: parent.physicalCallId,
      derivationIntent,
      provenance: {
        ...derivedProvenance,
        promptHash: derivedWire.wirePromptHash,
      },
      request: derivedWire,
    });
    assert.doesNotThrow(() => fx.controller.preFetchLease(child));
    const recovery = fx.controller.recoverAssignment("assignment-001");
    assert.equal(recovery.calls[1].contract.parentPhysicalCallId, parent.physicalCallId);
    assert.equal(recovery.calls[1].contract.transitionId, "candidate-repair");
    assert.equal(recovery.calls[1].contract.derivationReceiptHash, sha(stable(receiptMaterial)));
    const duplicateUse = leaseRequest(3, {
      parentPhysicalCallId: parent.physicalCallId,
      derivationIntent,
      provenance: child.provenance,
      request: derivedWire,
    });
    assert.throws(
      () => fx.controller.preFetchLease(duplicateUse),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "CONTROLLER_ENTRY_USE_CAP_EXCEEDED",
    );
  } finally {
    await fx.close();
  }
});

test("derived intent rejects unknown and cross-assignment parents before a durable lease", async () => {
  const derivedProvenance: AtlasResearchProvenance = {
    ...provenance,
    stage: "candidate-repair",
    promptHash: HASH.derivation,
  };
  const derivedEntry = entry({
    entryId: "derived-repair",
    provenance: derivedProvenance,
    wire: {
      ...entry().wire,
      requestMode: "derived",
      wireBodyHash: null,
      wirePromptHash: null,
      derivationContract: {
        contractId: "repair-from-parent-v1",
        artifactHash: HASH.derivation,
        allowedParentEntryIds: ["candidate-entry"],
      },
    },
    maxUsesPerAssignment: 1,
  });
  const fx = await fixture({
    entries: [entry({ maxUsesPerAssignment: 3 }), derivedEntry],
    transitions: [
      { transitionId: "root-candidate", fromEntryId: null, toEntryId: "candidate-entry" },
      { transitionId: "candidate-repair", fromEntryId: "candidate-entry", toEntryId: "derived-repair" },
    ],
    candidateBudget: 8,
    maxPhysicalProviderCalls: 16,
    maxCostUsd: 20,
  });
  try {
    const parentBody = '{"question":"parent-for-assignment-one"}';
    const parent = leaseRequest(1);
    await settleSuccessful(fx.controller, parent, parentBody);
    const derivedWire: AtlasResearchWireRequestFacts = {
      ...candidateWire,
      wireBodyHash: "e".repeat(64),
      canonicalRequestHash: "f".repeat(64),
      wirePromptHash: "0".repeat(64),
    };
    const intent = {
      contractId: "repair-from-parent-v1",
      artifactHash: HASH.derivation,
    };
    const childProvenance = {
      ...derivedProvenance,
      promptHash: derivedWire.wirePromptHash,
    };

    assert.throws(
      () => fx.controller.preFetchLease(leaseRequest(2, {
        parentPhysicalCallId: `${parent.operationId}:http:999`,
        derivationIntent: intent,
        provenance: childProvenance,
        request: derivedWire,
      })),
      (error: unknown) =>
        error instanceof AtlasResearchBoundaryError &&
        error.code === "CONTROLLER_REGISTRY_REJECTED",
    );

    const secondOperationId = "EXP-A:default:batch-ctrl:assignment-002";
    fx.controller.admitAssignment({
      operationId: secondOperationId,
      assignmentId: "assignment-002",
      contractId: assignmentContract.contractId,
    });
    assert.throws(
      () => fx.controller.preFetchLease(leaseRequest(1, {
        operationId: secondOperationId,
        physicalCallId: `${secondOperationId}:http:1`,
        parentPhysicalCallId: parent.physicalCallId,
        derivationIntent: intent,
        provenance: childProvenance,
        request: derivedWire,
      })),
      (error: unknown) =>
        error instanceof AtlasResearchBoundaryError &&
        error.code === "CONTROLLER_REGISTRY_REJECTED",
    );
    assert.equal(
      fx.controller.recoverAssignment("assignment-002").assignment.usedPhysicalCalls,
      0,
    );
  } finally {
    await fx.close();
  }
});

test("restart never replays an ambiguous lease and preserves unknown-after-send opportunity", async () => {
  const fx = await fixture();
  let reopened: BudgetStore | null = null;
  try {
    const request = leaseRequest(1);
    fx.controller.preFetchLease(request);
    fx.store.close();
    reopened = openTestBudgetStore(fx.storePath, fx.registryPath);
    const recoveredController = fx.makeController(reopened);
    assert.throws(
      () => recoveredController.preFetchLease(request),
      (error: unknown) =>
        error instanceof AtlasResearchBoundaryError && error.code === "CONTROLLER_REPLAY_REJECTED",
    );
    recoveredController.recoverAmbiguousCall({
      physicalCallId: request.physicalCallId,
      disposition: "unknown_after_send",
      reason: "process exited after durable lease; transport delivery cannot be proved",
    });
    const recovery = recoveredController.recoverAssignment("assignment-001");
    assert.equal(recovery.calls[0].candidateSlots[0].outcome, "unknown_after_send");
    assert.equal(recovery.assignment.usedCandidateOutputs, 1);
    assert.equal(recovery.assignment.observedSemanticCandidates, 0);
    assert.equal(recovery.calls[0].call.usageFinal, false);
    await assert.rejects(
      recoveredController.closeAssignment("assignment-001"),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "ASSIGNMENT_UNFINALIZED_USAGE",
    );
  } finally {
    if (reopened) await fx.close(reopened);
    else await rm(fx.root, { recursive: true, force: true });
  }
});

test("whole-assignment capacity refuses mid-policy admission and never enables queue top-up", async () => {
  const fx = await fixture();
  const second = {
    operationId: "EXP-A:default:batch-ctrl:assignment-002",
    assignmentId: "assignment-002",
    contractId: assignmentContract.contractId,
  };
  try {
    assert.throws(
      () => fx.controller.admitAssignment(second),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "ASSIGNMENT_CANDIDATE_ENVELOPE_EXCEEDED",
    );
    const request = leaseRequest(1);
    fx.controller.preFetchLease(request);
    fx.controller.recoverAmbiguousCall({
      physicalCallId: request.physicalCallId,
      disposition: "never_sent",
      reason: "crash was proved to precede delegate invocation",
    });
    const closed = await fx.controller.closeAssignment("assignment-001");
    assert.equal(closed.usedCandidateOutputs, 1);
    assert.equal(closed.observedSemanticCandidates, 0);
    assert.throws(
      () => fx.controller.admitAssignment(second),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "ASSIGNMENT_CANDIDATE_ENVELOPE_EXCEEDED",
    );
  } finally {
    await fx.close();
  }
});

test("clone-first and response-first crash gaps recover without replay", async () => {
  for (const order of ["clone-first", "response-first"] as const) {
    const fx = await fixture();
    let activeStore: BudgetStore | null = fx.store;
    const responseBody = `{"question":"${order}"}`;
    const request = leaseRequest(1);
    try {
      fx.controller.preFetchLease(request);
      if (order === "clone-first") {
        recordDirectClone(activeStore, request, responseBody, `${order}-1`);
      } else {
        recordDirectHttpTerminal(activeStore, request, `${order}-1`);
      }
      activeStore.close();
      activeStore = openTestBudgetStore(fx.storePath, fx.registryPath);
      fx.makeController(activeStore);
      let recovery = activeStore.getControllerAssignmentRecovery("assignment-001");
      if (order === "clone-first") {
        assert.notEqual(recovery.calls[0].call.state, "settled");
        assert.equal(recovery.calls[0].call.usageFinal, false);
        recordDirectHttpTerminal(activeStore, request, `${order}-2`);
      } else {
        assert.equal(recovery.calls[0].call.state, "settled");
        assert.equal(recovery.calls[0].call.usageFinal, false);
        recordDirectClone(activeStore, request, responseBody, `${order}-2`);
      }
      activeStore.close();
      activeStore = openTestBudgetStore(fx.storePath, fx.registryPath);
      const recoveredController = fx.makeController(activeStore);
      recovery = recoveredController.recoverAssignment("assignment-001");
      assert.equal(recovery.calls[0].call.state, "settled");
      assert.equal(recovery.calls[0].call.usageFinal, true);
      assert.equal(recovery.calls[0].call.outcome, "success");
      const parsed = await recoveredController.recordOperationParseResult({
        operationId: request.operationId,
        producerPhysicalCallId: request.physicalCallId,
      });
      activeStore.finalizeParsedCandidates({
        idempotencyKey: `finalize:${order}`,
        decisions: [{ candidateSlotId: parsed[0].candidateSlotId, outcome: "parsed_rejected" }],
      }, { apply: true });
      const closed = await recoveredController.closeAssignment("assignment-001");
      assert.equal(closed.state, "closed");
    } finally {
      if (activeStore) await fx.close(activeStore);
      else await rm(fx.root, { recursive: true, force: true });
    }
  }
});

test("oversized successful response recovers as unknown and quarantines without replay", async () => {
  const fx = await fixture();
  let reopened: BudgetStore | null = null;
  try {
    const request = leaseRequest(1);
    fx.controller.preFetchLease(request);
    recordDirectHttpTerminal(fx.store, request, "oversized-terminal");
    const cloneEvidence = {
      operationId: request.operationId,
      physicalCallId: request.physicalCallId,
      physicalOrdinal: request.physicalOrdinal,
      parseState: "body-too-large",
      responseBodyHash: null,
      generationId: null,
      servedModel: null,
      upstreamProvider: null,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      costState: "unknown",
      rawUsageCostUsd: null,
      upstreamInferenceCostUsd: null,
    };
    const cloneEvidenceJson = stable(cloneEvidence);
    fx.store.recordControllerCloneEvidence({
      idempotencyKey: "test:clone:oversized",
      callId: request.physicalCallId,
      responseBodyHash: null,
      evidenceJson: cloneEvidenceJson,
      evidenceHash: sha(cloneEvidenceJson),
    }, { apply: true });
    fx.store.close();
    reopened = openTestBudgetStore(fx.storePath, fx.registryPath);
    const recoveredController = fx.makeController(reopened);
    let recovery = recoveredController.recoverAssignment("assignment-001");
    assert.equal(recovery.assignment.state, "quarantined");
    assert.equal(recovery.assignment.usedCandidateOutputs, 1);
    assert.equal(recovery.assignment.observedSemanticCandidates, 0);
    assert.equal(recovery.calls[0].candidateSlots[0].outcome, "unknown_after_send");
    assert.equal(recovery.calls[0].call.usageFinal, false);
    reopened.reconcileCallUsage({
      idempotencyKey: "test:reconcile:oversized",
      callId: request.physicalCallId,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      usageFinal: true,
    }, { apply: true });
    const closed = await recoveredController.closeAssignment("assignment-001");
    assert.equal(closed.state, "closed");
    recovery = recoveredController.recoverAssignment("assignment-001");
    assert.equal(recovery.calls[0].call.usageFinal, true);
  } finally {
    if (reopened) await fx.close(reopened);
    else await rm(fx.root, { recursive: true, force: true });
  }
});

test("registry rejects conflicting candidate purpose and tampered self-hashes", async () => {
  const conflicting = entry({
    entryId: "spoofed-evaluation",
    purpose: "evaluation",
    candidateProducing: false,
    candidateContract: null,
  });
  assert.throws(
    () => sealAtlasControllerRegistry({
      schemaVersion: 2,
      controllerId: "purpose-conflict",
      operationIdPrefix: "EXP-A:default:batch-ctrl:",
      experimentId: "EXP-A",
      phaseId: "default",
      batchId: "batch-ctrl",
      entries: [entry(), conflicting],
      assignmentContracts: [assignmentContract],
      transitions: [
        { transitionId: "root-candidate", fromEntryId: null, toEntryId: "candidate-entry" },
        { transitionId: "root-eval", fromEntryId: null, toEntryId: "spoofed-evaluation" },
      ],
    }),
    (error: unknown) =>
      error instanceof AtlasResearchBoundaryError && error.code === "CONTROLLER_REGISTRY_INVALID",
  );
  const undersizedEnvelope = sealAtlasControllerAssignmentContract({
    contractId: "undersized-candidate-envelope",
    maxPhysicalCalls: 8,
    maxCandidateOutputs: 3,
    maxCostUsd: 10,
  });
  assert.throws(
    () => sealAtlasControllerRegistry({
      schemaVersion: 2,
      controllerId: "undersized-envelope",
      operationIdPrefix: "EXP-A:default:batch-ctrl:",
      experimentId: "EXP-A",
      phaseId: "default",
      batchId: "batch-ctrl",
      entries: [entry()],
      assignmentContracts: [undersizedEnvelope],
      transitions: [
        { transitionId: "root-candidate", fromEntryId: null, toEntryId: "candidate-entry" },
      ],
    }),
    (error: unknown) =>
      error instanceof AtlasResearchBoundaryError && error.code === "CONTROLLER_REGISTRY_INVALID",
  );
  const tamperedPricing = { ...pricing, basis: "tampered after hash" };
  assert.throws(
    () => sealAtlasControllerRegistry({
      schemaVersion: 2,
      controllerId: "price-tamper",
      operationIdPrefix: "EXP-A:default:batch-ctrl:",
      experimentId: "EXP-A",
      phaseId: "default",
      batchId: "batch-ctrl",
      entries: [entry({ pricing: tamperedPricing })],
      assignmentContracts: [assignmentContract],
      transitions: [
        { transitionId: "root-candidate", fromEntryId: null, toEntryId: "candidate-entry" },
      ],
    }),
    (error: unknown) =>
      error instanceof AtlasResearchBoundaryError && error.code === "CONTROLLER_REGISTRY_INVALID",
  );
});

test("archived OpenRouter snapshot re-hashes and proves all-endpoint maximum rates", async () => {
  const raw = JSON.parse(await readFile(join(
    process.cwd(),
    "experiments/question-quality-20260715/pricing/openrouter-pricing-snapshot.json",
  ), "utf8")) as unknown;
  const proof = deriveAtlasControllerPricingSnapshotProof("archived-openrouter", raw);
  assert.equal(
    proof.snapshotHash,
    "9e5557f0fa0c69105ade2668a1c84468b1ab8644b8adab167a8507cdb2a17869",
  );
  assert(Math.abs(proof.models["google/gemini-3.5-flash"].maxInputUsdPer1M - 2.7) < 1e-12);
  assert(Math.abs(proof.models["google/gemini-3.5-flash"].maxOutputUsdPer1M - 16.2) < 1e-12);
  assert(Math.abs(proof.models["google/gemini-3.1-pro-preview"].maxInputUsdPer1M - 7.2) < 1e-12);
  assert(Math.abs(proof.models["google/gemini-3.1-pro-preview"].maxOutputUsdPer1M - 32.4) < 1e-12);
  assert.match(
    proof.models["google/gemini-3.1-pro-preview"].providerAllowlistHash,
    /^[a-f0-9]{64}$/,
  );
});

test("pricing proof rejects zero rates, overlong windows, and stale admission", async () => {
  const { pricingContractHash: _pricingHash, ...pricingDraft } = pricing;
  assert.match(_pricingHash, /^[a-f0-9]{64}$/);
  const zeroRate = sealAtlasControllerPricingContract({
    ...pricingDraft,
    inputUsdPer1M: 0,
  });
  assert.throws(
    () => sealAtlasControllerRegistry({
      schemaVersion: 2,
      controllerId: "zero-rate",
      operationIdPrefix: "EXP-A:default:batch-ctrl:",
      experimentId: "EXP-A",
      phaseId: "default",
      batchId: "batch-ctrl",
      entries: [entry({ pricing: zeroRate })],
      assignmentContracts: [assignmentContract],
      transitions: [
        { transitionId: "root-candidate", fromEntryId: null, toEntryId: "candidate-entry" },
      ],
    }),
    (error: unknown) =>
      error instanceof AtlasResearchBoundaryError && error.code === "CONTROLLER_REGISTRY_INVALID",
  );
  const overlong = sealAtlasControllerPricingContract({
    ...pricingDraft,
    validThrough: "2026-07-17T00:00:00.000Z",
  });
  assert.throws(
    () => sealAtlasControllerRegistry({
      schemaVersion: 2,
      controllerId: "overlong-price-window",
      operationIdPrefix: "EXP-A:default:batch-ctrl:",
      experimentId: "EXP-A",
      phaseId: "default",
      batchId: "batch-ctrl",
      entries: [entry({ pricing: overlong })],
      assignmentContracts: [assignmentContract],
      transitions: [
        { transitionId: "root-candidate", fromEntryId: null, toEntryId: "candidate-entry" },
      ],
    }),
    (error: unknown) =>
      error instanceof AtlasResearchBoundaryError && error.code === "CONTROLLER_REGISTRY_INVALID",
  );
  const underpriced = sealAtlasControllerPricingContract({
    ...pricingDraft,
    inputUsdPer1M: 1.4,
  });
  await assert.rejects(
    fixture({ entries: [entry({ pricing: underpriced })], admit: false }),
    (error: unknown) =>
      error instanceof AtlasResearchBoundaryError &&
      error.code === "CONTROLLER_PRICING_PROOF_INVALID",
  );
  const tamperedSnapshot = {
    ...pricingSnapshot,
    models: [{
      ...pricingSnapshot.models[0],
      endpointRates: [{ ...pricingEndpoint, promptUsdPerToken: 0.5 }],
    }],
  };
  await assert.rejects(
    fixture({ pricingEvidence: tamperedSnapshot, admit: false }),
    (error: unknown) =>
      error instanceof AtlasResearchBoundaryError &&
      error.code === "CONTROLLER_PRICING_PROOF_INVALID",
  );
  const fx = await fixture({
    admit: false,
    now: "2026-07-16T00:00:00.001Z",
  });
  try {
    assert.throws(
      () => fx.controller.admitAssignment({
        operationId: "EXP-A:default:batch-ctrl:assignment-001",
        assignmentId: "assignment-001",
        contractId: assignmentContract.contractId,
      }),
      (error: unknown) =>
        error instanceof AtlasResearchBoundaryError &&
        error.code === "CONTROLLER_PRICING_PROOF_EXPIRED",
    );
    assert.equal(fx.store.getControllerAssignmentsForRegistry(fx.sealed.registryHash).length, 0);
  } finally {
    await fx.close();
  }
});
