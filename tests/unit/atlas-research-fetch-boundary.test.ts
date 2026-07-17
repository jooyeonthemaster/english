import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject } from "ai";
import { z } from "zod";

import {
  AtlasResearchBoundaryError,
  MAX_ATLAS_RESEARCH_CAPTURED_RESPONSE_BYTES,
  atlasResearchFetch,
  createAtlasResearchFetchDispatcher,
  getCurrentAtlasResearchLineage,
  installAtlasResearchFetchController,
  runWithAtlasResearchChildScope,
  runWithAtlasResearchScope,
  type AtlasResearchCandidateAttestationRequest,
  type AtlasResearchCloneEvidence,
  type AtlasResearchFetchController,
  type AtlasResearchFetchErrorEvidence,
  type AtlasResearchHttpResponseEvidence,
  type AtlasResearchLease,
  type AtlasResearchLeaseRequest,
  type AtlasResearchScope,
} from "../../src/lib/atlas-research-fetch-boundary";

const ENDPOINT = "https://mock.invalid/v1/chat/completions";
const ENDPOINT_HASH = createHash("sha256").update(ENDPOINT, "utf8").digest("hex");
const MODEL = "mock/model";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const ATTESTATION_ID = "single-question-json-v1";
const outputSchema = z.object({ value: z.string() });

test("exported no-scope transport resolves late global fetch with exact promise, response, and error identity", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const response = new Response("late-bound");
    const responsePromise = Promise.resolve(response);
    let seenInput: RequestInfo | URL | undefined;
    let seenInit: RequestInit | undefined;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      seenInput = input;
      seenInit = init;
      return responsePromise;
    }) as typeof fetch;
    const init = { method: "POST", body: "wire-bytes" };
    const returned = atlasResearchFetch(ENDPOINT, init);
    assert.equal(returned, responsePromise);
    assert.equal(await returned, response);
    assert.equal(seenInput, ENDPOINT);
    assert.equal(seenInit, init);

    const sentinel = new Error("late-bound transport error");
    globalThis.fetch = (() => {
      throw sentinel;
    }) as typeof fetch;
    assert.throws(() => atlasResearchFetch(ENDPOINT), (error) => error === sentinel);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AI SDK emits fixed questions cardinality and require_parameters on the actual wire", async () => {
  let capturedBody: Record<string, unknown> | undefined;
  const provider = createOpenAICompatible({
    name: "fixed-cardinality-probe",
    baseURL: "https://wire-probe.invalid/v1",
    apiKey: "test-only",
    fetch: async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return responseBody({
        content: JSON.stringify({ questions: [{ value: "ok" }] }),
      });
    },
    supportsStructuredOutputs: true,
    transformRequestBody: (args) => ({
      ...args,
      provider: { require_parameters: true },
    }),
  });
  await generateObject({
    model: provider.chatModel(MODEL),
    schema: z.object({ questions: z.array(outputSchema).length(1) }),
    prompt: "fixed cardinality",
    maxRetries: 0,
  });
  assert.ok(capturedBody);
  const responseFormat = capturedBody.response_format as {
    type?: unknown;
    json_schema?: { strict?: unknown; schema?: Record<string, unknown> };
  };
  assert.equal(responseFormat.type, "json_schema");
  assert.equal(responseFormat.json_schema?.strict, true);
  const properties = responseFormat.json_schema?.schema?.properties as {
    questions?: { minItems?: unknown; maxItems?: unknown };
  };
  assert.equal(properties.questions?.minItems, 1);
  assert.equal(properties.questions?.maxItems, 1);
  assert.deepEqual(capturedBody.provider, { require_parameters: true });
});

function candidateScope(
  operationId: string,
  overrides: Partial<AtlasResearchScope> = {},
): AtlasResearchScope {
  return {
    operationId,
    purpose: "candidate",
    expectedEndpoint: ENDPOINT,
    expectedCandidateOutputs: 1,
    candidateContract: {
      attestationId: ATTESTATION_ID,
      attestationHash: HASH_B,
      expectedCandidatesPerCompletion: 1,
    },
    parentPhysicalCallId: null,
    provenance: {
      requestedModel: MODEL,
      effectiveModel: MODEL,
      plan: "STANDARD",
      stage: "question-generation",
      promptHash: HASH_A,
      schemaHash: HASH_C,
      gateHash: HASH_A,
      ladderHash: null,
      policyHash: HASH_B,
      corpus: {
        corpusId: "probe-corpus",
        rowId: "row-001",
        passageHash: HASH_C,
      },
      runnerVersion: "boundary-test-v1",
      gitVersion: "test-commit",
    },
    ...overrides,
  };
}

function nonCandidateScope(
  operationId: string,
  purpose: "design" | "evaluation",
): AtlasResearchScope {
  const base = candidateScope(operationId);
  return {
    ...base,
    purpose,
    expectedCandidateOutputs: 0,
    candidateContract: undefined,
    provenance: {
      ...base.provenance,
      stage: `${purpose}-stage`,
      schemaHash: null,
    },
  };
}

function responseBody({
  content = JSON.stringify({ value: "ok" }),
  id = "gen-mock",
  status = 200,
  cost = 0.001,
  includeCost = true,
  byokUpstreamCost,
}: {
  content?: string;
  id?: string;
  status?: number;
  cost?: number;
  includeCost?: boolean;
  byokUpstreamCost?: number;
} = {}): Response {
  if (status >= 400) {
    return new Response(
      JSON.stringify({ error: { message: `simulated ${status}`, code: status } }),
      {
        status,
        headers: {
          "content-type": "application/json",
          "retry-after-ms": "0",
        },
      },
    );
  }
  return new Response(
    JSON.stringify({
      id,
      model: MODEL,
      provider: "MockProvider",
      created: 1_750_000_000,
      choices: [
        {
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 7,
        total_tokens: 18,
        ...(includeCost ? { cost } : {}),
        ...(byokUpstreamCost === undefined
          ? {}
          : {
              is_byok: true,
              cost_details: { upstream_inference_cost: byokUpstreamCost },
            }),
      },
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

function wireBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    model: MODEL,
    messages: [{ role: "user", content: "wire prompt marker" }],
    response_format: {
      type: "json_schema",
      json_schema: {
        schema: {
          type: "object",
          properties: { value: { type: "string" } },
          required: ["value"],
          additionalProperties: false,
        },
      },
    },
    ...overrides,
  });
}

class MemoryController implements AtlasResearchFetchController {
  readonly controllerId = "memory-boundary-controller";
  readonly attestations: AtlasResearchCandidateAttestationRequest[] = [];
  readonly leases: AtlasResearchLeaseRequest[] = [];
  readonly responses: AtlasResearchHttpResponseEvidence[] = [];
  readonly errors: AtlasResearchFetchErrorEvidence[] = [];
  readonly clones: AtlasResearchCloneEvidence[] = [];
  readonly pending: Promise<void>[] = [];

  attestCandidateContract(request: AtlasResearchCandidateAttestationRequest) {
    this.attestations.push(request);
    const contract = request.scope.candidateContract!;
    if (
      contract.attestationId !== ATTESTATION_ID ||
      contract.attestationHash !== HASH_B
    ) {
      throw new AtlasResearchBoundaryError(
        "UNTRUSTED_ATTESTATION",
        "test controller only permits its allow-listed contract",
      );
    }
    let candidatesPerCompletion: number;
    if (
      (request.request.outputShape === "json-schema-object" ||
        request.request.outputShape === "json-schema-fixed-array") &&
      request.request.structurallyFixedOutputsPerCompletion !== null
    ) {
      candidatesPerCompletion =
        request.request.structurallyFixedOutputsPerCompletion;
    } else {
      throw new AtlasResearchBoundaryError(
        "UNATTESTED_WIRE_CONTRACT",
        "wire output cardinality is not allow-listed",
      );
    }
    return {
      attestationId: ATTESTATION_ID,
      attestationHash: HASH_B,
      candidatesPerCompletion,
    };
  }

  preFetchLease(
    request: AtlasResearchLeaseRequest,
  ): AtlasResearchLease | Promise<AtlasResearchLease> {
    if (
      request.request.endpointOrigin !== "https://mock.invalid" ||
      request.request.endpointPath !== "/v1/chat/completions" ||
      request.request.endpointHash !== ENDPOINT_HASH
    ) {
      throw new AtlasResearchBoundaryError(
        "UNTRUSTED_ENDPOINT",
        "test controller rejects endpoints outside its allow-list",
      );
    }
    if (request.request.model !== MODEL) {
      throw new AtlasResearchBoundaryError(
        "UNTRUSTED_MODEL",
        "test controller rejects models outside its plan allow-list",
      );
    }
    this.leases.push(request);
    return { leaseId: `lease-${request.physicalCallId}` };
  }

  observeResponse(_lease: Readonly<AtlasResearchLease>, evidence: AtlasResearchHttpResponseEvidence) {
    this.responses.push(evidence);
  }

  observeError(_lease: Readonly<AtlasResearchLease>, evidence: AtlasResearchFetchErrorEvidence) {
    this.errors.push(evidence);
  }

  observeClone(_lease: Readonly<AtlasResearchLease>, evidence: AtlasResearchCloneEvidence) {
    this.clones.push(evidence);
  }

  trackCloneObservation(_lease: Readonly<AtlasResearchLease>, completion: Promise<void>) {
    this.pending.push(completion);
  }

  async drain() {
    await Promise.all(this.pending);
  }
}

async function withController<T>(
  controller: MemoryController,
  fn: () => T | Promise<T>,
): Promise<T> {
  const uninstall = installAtlasResearchFetchController(controller);
  try {
    return await fn();
  } finally {
    await controller.drain();
    uninstall();
  }
}

function makeModel(delegate: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const provider = createOpenAICompatible({
    baseURL: "https://mock.invalid/v1",
    name: "boundary-test",
    supportsStructuredOutputs: true,
    includeUsage: true,
    fetch: createAtlasResearchFetchDispatcher(delegate),
  });
  return provider.chatModel(MODEL);
}

function isBoundaryCode(code: string) {
  return (error: unknown) =>
    error instanceof AtlasResearchBoundaryError && error.code === code;
}

test("no-scope path returns the exact delegate promise/response and ignores installed controller", async () => {
  const controller = new MemoryController();
  await withController(controller, async () => {
    const sentinel = responseBody({ id: "no-scope" });
    const promised = Promise.resolve(sentinel);
    let seenInput: RequestInfo | URL | undefined;
    let seenInit: RequestInit | undefined;
    const delegate = (input: RequestInfo | URL, init?: RequestInit) => {
      seenInput = input;
      seenInit = init;
      return promised;
    };
    const dispatcher = createAtlasResearchFetchDispatcher(delegate);
    const init = { method: "PATCH", body: "opaque-no-scope-body" };
    const returnedPromise = dispatcher("https://no-scope.invalid/arbitrary", init);

    assert.equal(returnedPromise, promised);
    assert.equal(await returnedPromise, sentinel);
    assert.equal(seenInput, "https://no-scope.invalid/arbitrary");
    assert.equal(seenInit, init);
    assert.equal(controller.leases.length, 0);
    assert.equal(controller.responses.length, 0);
  });
});

test("active scope without a controller fails before fetch", async () => {
  let delegateCalls = 0;
  const dispatcher = createAtlasResearchFetchDispatcher(async () => {
    delegateCalls++;
    return responseBody();
  });

  await assert.rejects(
    runWithAtlasResearchScope(candidateScope("missing-controller"), () =>
      dispatcher(ENDPOINT, { method: "POST", body: wireBody() }),
    ),
    isBoundaryCode("MISSING_CONTROLLER"),
  );
  assert.equal(delegateCalls, 0);
});

test("controller failures cannot masquerade as retryable provider-network errors", async () => {
  class FailingLeaseController extends MemoryController {
    override preFetchLease(): never {
      throw new TypeError("fetch failed", {
        cause: new Error("simulated private ledger failure"),
      });
    }
  }
  const controller = new FailingLeaseController();
  let delegateCalls = 0;
  const model = makeModel(async () => {
    delegateCalls++;
    return responseBody();
  });

  await withController(controller, async () => {
    await assert.rejects(
      runWithAtlasResearchScope(candidateScope("controller-not-network"), () =>
        generateObject({
          model,
          schema: outputSchema,
          prompt: "Return structured JSON.",
        }),
      ),
      isBoundaryCode("CONTROLLER_LEASE_FAILED"),
    );
  });

  assert.equal(controller.attestations.length, 1);
  assert.equal(delegateCalls, 0);
});

test("controller installation is single-owner with no force-reset bypass", () => {
  const controller = new MemoryController();
  const uninstall = installAtlasResearchFetchController(controller);
  assert.throws(
    () => installAtlasResearchFetchController(new MemoryController()),
    isBoundaryCode("CONTROLLER_ALREADY_INSTALLED"),
  );
  uninstall();
  assert.throws(uninstall, isBoundaryCode("CONTROLLER_ALREADY_UNINSTALLED"));
});

test("controller cannot be uninstalled while an operation is active", async () => {
  const controller = new MemoryController();
  const uninstall = installAtlasResearchFetchController(controller);
  await runWithAtlasResearchScope(nonCandidateScope("active-uninstall", "design"), () => {
    assert.throws(uninstall, isBoundaryCode("CONTROLLER_HAS_ACTIVE_OPERATIONS"));
  });
  uninstall();
});

test("root scope rejects forged parent lineage before any controller or fetch work", async () => {
  const controller = new MemoryController();
  let delegateCalls = 0;
  const dispatcher = createAtlasResearchFetchDispatcher(async () => {
    delegateCalls++;
    return responseBody();
  });

  await withController(controller, async () => {
    await assert.rejects(
      runWithAtlasResearchScope(
        candidateScope("root-with-parent", {
          parentPhysicalCallId: "forged-parent:http:99",
        }),
        () => dispatcher(ENDPOINT, { method: "POST", body: wireBody() }),
      ),
      isBoundaryCode("ROOT_HAS_PARENT_LINEAGE"),
    );
  });

  assert.equal(delegateCalls, 0);
  assert.equal(controller.leases.length, 0);
});

test("AI SDK default maxRetries=2 leases and observes exactly three physical fetches", async () => {
  const controller = new MemoryController();
  let calls = 0;
  const model = makeModel(async () => {
    calls++;
    return calls < 3
      ? responseBody({ status: 503 })
      : responseBody({ id: "retry-success", cost: 0.004 });
  });

  await withController(controller, async () => {
    const result = await runWithAtlasResearchScope(candidateScope("sdk-default-retry"), () =>
      generateObject({
        model,
        schema: outputSchema,
        prompt: "Return secret-marker as structured JSON.",
        maxOutputTokens: 128,
      }),
    );
    assert.deepEqual(result.object, { value: "ok" });
  });

  assert.equal(calls, 3);
  assert.equal(controller.attestations.length, 3);
  assert.equal(controller.leases.length, 3);
  assert.deepEqual(
    controller.leases.map(lease => lease.physicalOrdinal),
    [1, 2, 3],
  );
  assert.deepEqual(
    controller.leases.map(lease => lease.candidateOutputs),
    [1, 1, 1],
  );
  assert.deepEqual(
    controller.responses.map(response => response.status),
    [503, 503, 200],
  );
  assert.equal(controller.clones.length, 3);
  assert.equal(controller.clones[2].generationId, "retry-success");
  assert.equal(controller.clones[2].costUsd, 0.004);
  assert.ok(
    controller.leases.every(
      lease => lease.request.canonicalRequestHash === controller.leases[0].request.canonicalRequestHash,
    ),
  );
  assert.ok(
    controller.leases.every(
      lease => lease.request.wireBodyHash === controller.leases[0].request.wireBodyHash,
    ),
  );
  assert.match(controller.leases[0].request.wireBodyHash, /^[a-f0-9]{64}$/);
  assert.ok(controller.leases[0].request.requestBodyUtf8Bytes > 0);
  assert.ok(
    controller.leases.every(
      lease =>
        lease.request.requestBodyUtf8Bytes ===
        controller.leases[0].request.requestBodyUtf8Bytes,
    ),
  );
  assert.ok(
    controller.leases.every(
      lease =>
        lease.request.maxTokens === 128 ||
        lease.request.maxCompletionTokens === 128 ||
        lease.request.maxOutputTokens === 128,
    ),
  );
  assert.doesNotMatch(JSON.stringify(controller.leases), /secret-marker/);
});

test("maxRetries=0 makes one lease and preserves non-2xx plus unknown-cost evidence", async () => {
  const controller = new MemoryController();
  let calls = 0;
  const model = makeModel(async () => {
    calls++;
    return responseBody({ status: 503 });
  });

  await withController(controller, async () => {
    await assert.rejects(() =>
      runWithAtlasResearchScope(candidateScope("sdk-no-retry"), () =>
        generateObject({
          model,
          schema: outputSchema,
          prompt: "Return structured JSON.",
          maxRetries: 0,
        }),
      ),
    );
  });

  assert.equal(calls, 1);
  assert.equal(controller.leases.length, 1);
  assert.equal(controller.responses[0].status, 503);
  assert.equal(controller.responses[0].terminalKind, "http-response");
  assert.equal(controller.clones[0].costState, "unknown");
  assert.equal(controller.clones[0].costUsd, undefined);
});

test("malformed JSON repair keeps one trusted child intent across AI SDK physical retries", async () => {
  const controller = new MemoryController();
  let calls = 0;
  const model = makeModel(async () => {
    calls++;
    if (calls === 1) {
      return responseBody({
          content: '{"value":',
          id: "malformed-original",
          cost: 0.001,
        });
    }
    if (calls === 2) return responseBody({ status: 503 });
    return responseBody({
      content: JSON.stringify({ value: "repaired" }),
      id: "repair-call",
      cost: 0.002,
    });
  });

  let repairUsageInput: number | undefined;
  await withController(controller, async () => {
    const root = candidateScope("explicit-repair");
    const result = await runWithAtlasResearchScope(root, () =>
      generateObject({
        model,
        schema: outputSchema,
        prompt: "Return structured JSON.",
        maxRetries: 0,
        experimental_repairText: async ({ text }) => {
          const lineage = getCurrentAtlasResearchLineage();
          assert.ok(lineage?.lastPhysicalCallId);
          const child = candidateScope(root.operationId, {
            parentPhysicalCallId: lineage.lastPhysicalCallId,
            derivationIntent: {
              contractId: "json-repair-v1",
              artifactHash: HASH_C,
            },
            provenance: {
              ...root.provenance,
              stage: "json-repair",
              promptHash: HASH_C,
            },
          });
          return runWithAtlasResearchChildScope(child, async () => {
            const repair = await generateObject({
              model,
              schema: outputSchema,
              prompt: `Repair this JSON: ${text}`,
            });
            repairUsageInput = repair.usage.inputTokens;
            return JSON.stringify(repair.object);
          });
        },
      }),
    );
    assert.deepEqual(result.object, { value: "repaired" });
    assert.equal(result.usage.inputTokens, 11);
  });

  assert.equal(repairUsageInput, 11);
  assert.equal(controller.leases.length, 3);
  assert.deepEqual(
    controller.leases.map(lease => lease.physicalOrdinal),
    [1, 2, 3],
  );
  assert.deepEqual(
    controller.leases.map(lease => lease.provenance.stage),
    ["question-generation", "json-repair", "json-repair"],
  );
  assert.equal(
    controller.leases[1].parentPhysicalCallId,
    controller.leases[0].physicalCallId,
  );
  assert.equal(
    controller.leases[2].parentPhysicalCallId,
    controller.leases[0].physicalCallId,
  );
  assert.deepEqual(controller.leases[1].derivationIntent, {
    contractId: "json-repair-v1",
    artifactHash: HASH_C,
  });
  assert.deepEqual(controller.leases[2].derivationIntent, {
    contractId: "json-repair-v1",
    artifactHash: HASH_C,
  });
  assert.equal(
    controller.leases[1].provenance.promptHash,
    controller.leases[1].request.wirePromptHash,
  );
  assert.notEqual(controller.leases[1].provenance.promptHash, HASH_C);
  assert.deepEqual(
    controller.clones.map(clone => clone.generationId),
    ["malformed-original", null, "repair-call"],
  );
  assert.deepEqual(
    controller.clones.map(clone => clone.costUsd),
    [0.001, undefined, 0.002],
  );
});

test("caller-supplied derivation receipt material is rejected before lease or network", async () => {
  const controller = new MemoryController();
  let delegateCalls = 0;
  const dispatcher = createAtlasResearchFetchDispatcher(async () => {
    delegateCalls++;
    return responseBody();
  });
  const forged = {
    ...candidateScope("forged-receipt"),
    derivationReceipt: {
      contractId: "forged",
      artifactHash: HASH_A,
      parentPhysicalCallId: "forged:http:1",
      parentResponseBodyHash: HASH_A,
      derivedWireBodyHash: HASH_B,
      derivedWirePromptHash: HASH_C,
      receiptHash: HASH_A,
    },
  } as AtlasResearchScope;

  await withController(controller, async () => {
    await assert.rejects(
      runWithAtlasResearchScope(forged, () =>
        dispatcher(ENDPOINT, { method: "POST", body: wireBody() }),
      ),
      isBoundaryCode("CALLER_DERIVATION_RECEIPT_FORBIDDEN"),
    );
  });
  assert.equal(delegateCalls, 0);
  assert.equal(controller.leases.length, 0);
});

test("child scope rejects a stale parent before lease while latest-parent SDK retry remains scoped", async () => {
  const controller = new MemoryController();
  let delegateCalls = 0;
  const dispatcher = createAtlasResearchFetchDispatcher(async () => {
    delegateCalls++;
    return responseBody({ id: `stale-parent-${delegateCalls}` });
  });

  await withController(controller, async () => {
    const root = candidateScope("stale-parent");
    await runWithAtlasResearchScope(root, async () => {
      await dispatcher(ENDPOINT, { method: "POST", body: wireBody() });
      const first = getCurrentAtlasResearchLineage()?.lastPhysicalCallId;
      assert.ok(first);
      await dispatcher(ENDPOINT, { method: "POST", body: wireBody() });
      const latest = getCurrentAtlasResearchLineage()?.lastPhysicalCallId;
      assert.ok(latest);
      assert.notEqual(first, latest);
      await assert.rejects(
        runWithAtlasResearchChildScope(
          candidateScope(root.operationId, {
            parentPhysicalCallId: first,
            derivationIntent: {
              contractId: "repair-v1",
              artifactHash: HASH_C,
            },
          }),
          () => dispatcher(ENDPOINT, { method: "POST", body: wireBody() }),
        ),
        isBoundaryCode("PARENT_LINEAGE_MISMATCH"),
      );
    });
  });

  assert.equal(delegateCalls, 2);
  assert.equal(controller.leases.length, 2);
});

test("child scope drains and rejects an unawaited provider fetch", async () => {
  const controller = new MemoryController();
  const dispatcher = createAtlasResearchFetchDispatcher(async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    return responseBody();
  });

  await withController(controller, async () => {
    const root = candidateScope("escaped-child-fetch");
    await runWithAtlasResearchScope(root, async () => {
      await dispatcher(ENDPOINT, { method: "POST", body: wireBody() });
      const lineage = getCurrentAtlasResearchLineage();
      assert.ok(lineage?.lastPhysicalCallId);
      const child = candidateScope(root.operationId, {
        parentPhysicalCallId: lineage.lastPhysicalCallId,
        provenance: { ...root.provenance, stage: "repair-child" },
      });
      await assert.rejects(
        runWithAtlasResearchChildScope(child, () => {
          void dispatcher(ENDPOINT, { method: "POST", body: wireBody() });
        }),
        isBoundaryCode("UNAWAITED_PROVIDER_FETCH"),
      );
    });
  });

  assert.equal(controller.leases.length, 2);
  assert.equal(controller.responses.length, 2);
  assert.equal(controller.clones.length, 2);
});

test("async work escaping a closed child scope cannot reuse stale provenance", async () => {
  const controller = new MemoryController();
  let delegateCalls = 0;
  const dispatcher = createAtlasResearchFetchDispatcher(async () => {
    delegateCalls++;
    return responseBody();
  });
  let escapedTask!: Promise<void>;
  let escapedCode: string | undefined;

  await withController(controller, async () => {
    const root = candidateScope("late-child-task");
    await runWithAtlasResearchScope(root, async () => {
      await dispatcher(ENDPOINT, { method: "POST", body: wireBody() });
      const lineage = getCurrentAtlasResearchLineage();
      assert.ok(lineage?.lastPhysicalCallId);
      const child = candidateScope(root.operationId, {
        parentPhysicalCallId: lineage.lastPhysicalCallId,
        provenance: { ...root.provenance, stage: "closed-child" },
      });
      await runWithAtlasResearchChildScope(child, () => {
        escapedTask = new Promise(resolve => {
          setTimeout(() => {
            void dispatcher(ENDPOINT, { method: "POST", body: wireBody() })
              .catch(error => {
                if (error instanceof AtlasResearchBoundaryError) {
                  escapedCode = error.code;
                }
              })
              .finally(resolve);
          }, 0);
        });
      });
      await escapedTask;
    });
  });

  assert.equal(escapedCode, "SCOPE_CLOSED");
  assert.equal(delegateCalls, 1);
  assert.equal(controller.leases.length, 1);
});

test("concurrent ALS operations keep independent operation IDs and ordinals", async () => {
  const controller = new MemoryController();
  const model = makeModel(async () => responseBody());

  await withController(controller, async () => {
    await Promise.all([
      runWithAtlasResearchScope(candidateScope("parallel-a"), () =>
        generateObject({
          model,
          schema: outputSchema,
          prompt: "Return A.",
          maxRetries: 0,
        }),
      ),
      runWithAtlasResearchScope(candidateScope("parallel-b"), () =>
        generateObject({
          model,
          schema: outputSchema,
          prompt: "Return B.",
          maxRetries: 0,
        }),
      ),
    ]);
  });

  assert.deepEqual(
    new Set(controller.leases.map(lease => lease.operationId)),
    new Set(["parallel-a", "parallel-b"]),
  );
  assert.ok(controller.leases.every(lease => lease.physicalOrdinal === 1));
});

test("same-operation concurrent fetches fail closed instead of corrupting latest-parent lineage", async () => {
  const controller = new MemoryController();
  let delegateCalls = 0;
  const dispatcher = createAtlasResearchFetchDispatcher(async () => {
    delegateCalls++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return responseBody();
  });

  await withController(controller, async () => {
    await assert.rejects(
      runWithAtlasResearchScope(candidateScope("same-operation-parallel"), () =>
        Promise.all([
          dispatcher(ENDPOINT, { method: "POST", body: wireBody() }),
          dispatcher(ENDPOINT, { method: "POST", body: wireBody() }),
        ]),
      ),
      isBoundaryCode("CONCURRENT_OPERATION_FETCH"),
    );
  });

  assert.equal(delegateCalls, 1);
  assert.equal(controller.leases.length, 1);
  assert.equal(controller.responses.length, 1);
  assert.equal(controller.clones.length, 1);
});

test("root scope drains an escaped physical fetch before reporting it as unawaited", async () => {
  const controller = new MemoryController();
  const dispatcher = createAtlasResearchFetchDispatcher(async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    return responseBody({ id: "escaped-fetch" });
  });

  await withController(controller, async () => {
    await assert.rejects(
      runWithAtlasResearchScope(candidateScope("escaped-fetch"), () => {
        void dispatcher(ENDPOINT, { method: "POST", body: wireBody() });
      }),
      isBoundaryCode("UNAWAITED_PROVIDER_FETCH"),
    );
  });

  assert.equal(controller.leases.length, 1);
  assert.equal(controller.responses.length, 1);
  assert.equal(controller.clones[0].generationId, "escaped-fetch");
});

test("root operation ownership remains active until delayed clone observation settles", async () => {
  let releaseClone!: () => void;
  const cloneGate = new Promise<void>(resolve => {
    releaseClone = resolve;
  });
  class DelayedCloneController extends MemoryController {
    override async observeClone(
      lease: Readonly<AtlasResearchLease>,
      evidence: AtlasResearchCloneEvidence,
    ) {
      await cloneGate;
      super.observeClone(lease, evidence);
    }
  }
  const controller = new DelayedCloneController();
  const uninstall = installAtlasResearchFetchController(controller);
  const dispatcher = createAtlasResearchFetchDispatcher(async () => responseBody());
  let settled = false;
  const operation = runWithAtlasResearchScope(
    nonCandidateScope("delayed-clone", "evaluation"),
    () => dispatcher(ENDPOINT, { method: "POST", body: wireBody() }),
  ).then(() => {
    settled = true;
  });

  try {
    while (controller.responses.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(settled, false);
    assert.throws(uninstall, isBoundaryCode("CONTROLLER_HAS_ACTIVE_OPERATIONS"));
    releaseClone();
    await operation;
    assert.equal(controller.clones.length, 1);
  } finally {
    releaseClone();
    await operation.catch(() => undefined);
    uninstall();
  }
});

test("network and abort failures are terminal evidence after a pre-fetch lease", async () => {
  const controller = new MemoryController();
  const networkDispatcher = createAtlasResearchFetchDispatcher(async () => {
    const error = new TypeError("fetch failed");
    (error as TypeError & { code?: string }).code = "ECONNRESET";
    throw error;
  });
  const abortDispatcher = createAtlasResearchFetchDispatcher(async () => {
    throw new DOMException("simulated abort", "AbortError");
  });

  await withController(controller, async () => {
    await assert.rejects(() =>
      runWithAtlasResearchScope(nonCandidateScope("network-evidence", "design"), () =>
        networkDispatcher(ENDPOINT, { method: "POST", body: wireBody() }),
      ),
    );
    await assert.rejects(() =>
      runWithAtlasResearchScope(nonCandidateScope("abort-evidence", "evaluation"), () =>
        abortDispatcher(ENDPOINT, { method: "POST", body: wireBody() }),
      ),
    );
  });

  assert.equal(controller.leases.length, 2);
  assert.ok(controller.leases.every(lease => lease.candidateOutputs === 0));
  assert.deepEqual(
    controller.errors.map(error => error.terminalKind),
    ["network-error", "abort"],
  );
  assert.ok(controller.errors.every(error => /^[a-f0-9]{64}$/.test(error.errorMessageHash)));
});

test("arbitrary error names and codes never enter persisted transport evidence", async () => {
  const controller = new MemoryController();
  const secret = "sk-sensitive-error-payload";
  const dispatcher = createAtlasResearchFetchDispatcher(async () => {
    const error = new Error(secret);
    error.name = secret;
    (error as Error & { code?: string }).code = secret;
    throw error;
  });

  await withController(controller, async () => {
    await assert.rejects(() =>
      runWithAtlasResearchScope(nonCandidateScope("redacted-error", "design"), () =>
        dispatcher(ENDPOINT, { method: "POST", body: wireBody() }),
      ),
    );
  });

  assert.equal(controller.errors[0].errorName, "UnknownFetchError");
  assert.equal(controller.errors[0].errorCode, null);
  assert.doesNotMatch(JSON.stringify(controller.errors), new RegExp(secret));
  assert.match(controller.errors[0].errorMessageHash, /^[a-f0-9]{64}$/);
});

test("research transport snapshots mutable URL, headers, and body before controller awaits", async () => {
  let releaseLease!: () => void;
  let leaseStarted!: () => void;
  const leaseGate = new Promise<void>(resolve => {
    releaseLease = resolve;
  });
  const leaseStartedGate = new Promise<void>(resolve => {
    leaseStarted = resolve;
  });
  class DelayedLeaseController extends MemoryController {
    override async preFetchLease(request: AtlasResearchLeaseRequest) {
      const lease = await super.preFetchLease(request);
      leaseStarted();
      await leaseGate;
      return lease;
    }
  }
  const controller = new DelayedLeaseController();
  let seenUrl = "";
  let seenBody = "";
  let seenHeader = "";
  let seenRouterMetadataHeader = "";
  const dispatcher = createAtlasResearchFetchDispatcher(async (input, init) => {
    seenUrl = input instanceof Request ? input.url : input.toString();
    seenBody = String(init?.body ?? "");
    seenHeader = new Headers(init?.headers).get("x-research-marker") ?? "";
    seenRouterMetadataHeader =
      new Headers(init?.headers).get("x-openrouter-metadata") ?? "";
    return responseBody();
  });
  const url = new URL(ENDPOINT);
  const headers = new Headers({ "x-research-marker": "original" });
  const init: RequestInit = { method: "POST", headers, body: wireBody() };

  await withController(controller, async () => {
    const operation = runWithAtlasResearchScope(candidateScope("argument-snapshot"), () =>
      dispatcher(url, init),
    );
    await leaseStartedGate;
    url.pathname = "/mutated";
    headers.set("x-research-marker", "mutated");
    init.body = wireBody({ model: "mutated/model" });
    releaseLease();
    await operation;
  });

  assert.equal(seenUrl, ENDPOINT);
  assert.equal(seenBody, wireBody());
  assert.equal(seenHeader, "original");
  assert.equal(seenRouterMetadataHeader, "enabled");
});

test("clone billing evidence survives a terminal-response observer failure", async () => {
  class FailingResponseController extends MemoryController {
    override observeResponse(): never {
      throw new Error("simulated durable response observer failure");
    }
  }
  const controller = new FailingResponseController();
  let delegateCalls = 0;
  const model = makeModel(async () => {
    delegateCalls++;
    return responseBody({ id: "observer-failed", cost: 0.003 });
  });

  await withController(controller, async () => {
    await assert.rejects(
      runWithAtlasResearchScope(candidateScope("observer-failure"), () =>
        generateObject({
          model,
          schema: outputSchema,
          prompt: "Return structured JSON.",
        }),
      ),
      isBoundaryCode("CONTROLLER_RESPONSE_OBSERVATION_FAILED"),
    );
  });

  assert.equal(delegateCalls, 1);
  assert.equal(controller.clones.length, 1);
  assert.equal(controller.clones[0].generationId, "observer-failed");
  assert.equal(controller.clones[0].costUsd, 0.003);
});

test("terminal and clone evidence still run when clone tracking registration throws", async () => {
  class FailingTrackController extends MemoryController {
    override trackCloneObservation(): never {
      throw new Error("simulated clone tracking registration failure");
    }
  }
  const controller = new FailingTrackController();
  const dispatcher = createAtlasResearchFetchDispatcher(async () =>
    responseBody({ id: "track-failed", cost: 0.004 }),
  );

  await withController(controller, async () => {
    await assert.rejects(() =>
      runWithAtlasResearchScope(nonCandidateScope("track-failure", "evaluation"), () =>
        dispatcher(ENDPOINT, { method: "POST", body: wireBody() }),
      ),
    );
  });

  assert.equal(controller.responses.length, 1);
  assert.equal(controller.clones.length, 1);
  assert.equal(controller.clones[0].generationId, "track-failed");
  assert.equal(controller.clones[0].costUsd, 0.004);
});

test("bounded response capture records billing fields and forwards the exact body", async () => {
  const controller = new MemoryController();
  const dispatcher = createAtlasResearchFetchDispatcher(async () =>
    responseBody({ id: "byok-response", cost: 0.0004, byokUpstreamCost: 0.0016 }),
  );

  await withController(controller, async () => {
    const response = await runWithAtlasResearchScope(
      nonCandidateScope("clone-original", "evaluation"),
      () => dispatcher(ENDPOINT, { method: "POST", body: wireBody() }),
    );
    const original = (await response.json()) as { id: string };
    assert.equal(original.id, "byok-response");
  });

  assert.equal(controller.clones.length, 1);
  const clone = controller.clones[0];
  assert.equal(clone.generationId, "byok-response");
  assert.equal(clone.servedModel, MODEL);
  assert.equal(clone.upstreamProvider, "MockProvider");
  assert.equal(clone.promptTokens, 11);
  assert.equal(clone.completionTokens, 7);
  assert.equal(clone.costState, "reported");
  assert.equal(clone.rawUsageCostUsd, 0.0004);
  assert.equal(clone.upstreamInferenceCostUsd, 0.0016);
  assert.equal(clone.costUsd, 0.002);
  assert.ok(clone.responseBodyHash && /^[a-f0-9]{64}$/.test(clone.responseBodyHash));
  assert(clone.capturedResponseBody instanceof Uint8Array);
  const captured = JSON.parse(new TextDecoder().decode(clone.capturedResponseBody)) as {
    id: string;
  };
  assert.equal(captured.id, "byok-response");
});

test("research response streaming stops and fails closed once the capture bound is crossed", async () => {
  const controller = new MemoryController();
  const chunkBytes = 1024 * 1024;
  const chunk = new Uint8Array(chunkBytes).fill(65);
  let pulls = 0;
  let cancelled = false;
  const dispatcher = createAtlasResearchFetchDispatcher(async () => new Response(
    new ReadableStream<Uint8Array>({
      pull(streamController) {
        pulls++;
        if (pulls > 100) {
          streamController.close();
          return;
        }
        streamController.enqueue(new Uint8Array(chunk));
      },
      cancel() {
        cancelled = true;
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  ));

  await withController(controller, async () => {
    await assert.rejects(
      runWithAtlasResearchScope(
        nonCandidateScope("bounded-clone-stream", "evaluation"),
        () => dispatcher(ENDPOINT, { method: "POST", body: wireBody() }),
      ),
      isBoundaryCode("RESPONSE_BODY_UNINSPECTABLE"),
    );
  });

  assert.equal(controller.clones.length, 1);
  assert.equal(controller.clones[0].parseState, "body-too-large");
  assert.equal(controller.clones[0].capturedResponseBody, null);
  assert.equal(controller.clones[0].responseBodyHash, null);
  assert(pulls <= Math.ceil(MAX_ATLAS_RESEARCH_CAPTURED_RESPONSE_BYTES / chunkBytes) + 2);
  assert.equal(cancelled, true);
});

test("model, endpoint, cardinality, and streaming mismatches all fail before fetch/lease", async () => {
  const controller = new MemoryController();
  let delegateCalls = 0;
  const dispatcher = createAtlasResearchFetchDispatcher(async () => {
    delegateCalls++;
    return responseBody();
  });

  await withController(controller, async () => {
    await assert.rejects(
      runWithAtlasResearchScope(
        candidateScope("model-mismatch", {
          provenance: {
            ...candidateScope("unused").provenance,
            effectiveModel: "mock/other-model",
          },
        }),
        () => dispatcher(ENDPOINT, { method: "POST", body: wireBody() }),
      ),
      isBoundaryCode("MODEL_MISMATCH"),
    );
    await assert.rejects(
      runWithAtlasResearchScope(candidateScope("endpoint-mismatch"), () =>
        dispatcher("https://other.invalid/v1/chat/completions", {
          method: "POST",
          body: wireBody(),
        }),
      ),
      isBoundaryCode("ENDPOINT_MISMATCH"),
    );
    await assert.rejects(
      runWithAtlasResearchScope(
        candidateScope("trailing-slash-endpoint", {
          expectedEndpoint: `${ENDPOINT}/`,
        }),
        () =>
          dispatcher(`${ENDPOINT}/`, {
            method: "POST",
            body: wireBody(),
          }),
      ),
      isBoundaryCode("UNTRUSTED_ENDPOINT"),
    );
    await assert.rejects(
      runWithAtlasResearchScope(
        candidateScope("query-endpoint", {
          expectedEndpoint: `${ENDPOINT}?route=other`,
        }),
        () =>
          dispatcher(`${ENDPOINT}?route=other`, {
            method: "POST",
            body: wireBody(),
          }),
      ),
      isBoundaryCode("UNTRUSTED_ENDPOINT"),
    );
    await assert.rejects(
      runWithAtlasResearchScope(candidateScope("cardinality-mismatch"), () =>
        dispatcher(ENDPOINT, { method: "POST", body: wireBody({ n: 2 }) }),
      ),
      isBoundaryCode("CANDIDATE_CARDINALITY_MISMATCH"),
    );
    await assert.rejects(
      runWithAtlasResearchScope(candidateScope("streaming-mismatch"), () =>
        dispatcher(ENDPOINT, { method: "POST", body: wireBody({ stream: true }) }),
      ),
      isBoundaryCode("STREAMING_UNSUPPORTED"),
    );
    const maliciousScope = candidateScope("caller-lies-about-endpoint-model", {
      expectedEndpoint: "https://evil.invalid/v1/chat/completions",
      provenance: {
        ...candidateScope("unused-malicious").provenance,
        requestedModel: "evil/model",
        effectiveModel: "evil/model",
      },
    });
    await assert.rejects(
      runWithAtlasResearchScope(maliciousScope, () =>
        dispatcher("https://evil.invalid/v1/chat/completions", {
          method: "POST",
          body: wireBody({ model: "evil/model" }),
        }),
      ),
      isBoundaryCode("UNTRUSTED_ENDPOINT"),
    );
  });

  assert.equal(delegateCalls, 0);
  assert.equal(controller.leases.length, 0);
});

test("unattested text cardinality is fail-closed before lease/network", async () => {
  const controller = new MemoryController();
  let delegateCalls = 0;
  const dispatcher = createAtlasResearchFetchDispatcher(async () => {
    delegateCalls++;
    return responseBody();
  });

  await withController(controller, async () => {
    await assert.rejects(
      runWithAtlasResearchScope(candidateScope("opaque-text-contract"), () =>
        dispatcher(ENDPOINT, {
          method: "POST",
          body: JSON.stringify({
            model: MODEL,
            messages: [{ role: "user", content: "produce several things" }],
          }),
        }),
      ),
      isBoundaryCode("UNATTESTED_WIRE_CONTRACT"),
    );
  });

  assert.equal(delegateCalls, 0);
  assert.equal(controller.leases.length, 0);
});

test("json_object and unbounded questions arrays are fail-closed before lease/network", async () => {
  const controller = new MemoryController();
  let delegateCalls = 0;
  const dispatcher = createAtlasResearchFetchDispatcher(async () => {
    delegateCalls++;
    return responseBody();
  });
  const unboundedSchema = {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: { value: { type: "string" } },
          required: ["value"],
          additionalProperties: false,
        },
      },
    },
    required: ["questions"],
    additionalProperties: false,
  };

  await withController(controller, async () => {
    for (const [operationId, responseFormat] of [
      ["json-object-unbounded", { type: "json_object" }],
      [
        "questions-array-unbounded",
        { type: "json_schema", json_schema: { schema: unboundedSchema } },
      ],
    ] as const) {
      await assert.rejects(
        runWithAtlasResearchScope(candidateScope(operationId), () =>
          dispatcher(ENDPOINT, {
            method: "POST",
            body: wireBody({ response_format: responseFormat }),
          }),
        ),
        isBoundaryCode("UNATTESTED_WIRE_CONTRACT"),
      );
    }
  });

  assert.equal(delegateCalls, 0);
  assert.equal(controller.leases.length, 0);
});
