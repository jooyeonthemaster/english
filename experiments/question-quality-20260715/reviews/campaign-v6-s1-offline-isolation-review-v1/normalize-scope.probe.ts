import assert from "node:assert/strict";

import {
  createAtlasResearchFetchDispatcher,
  installAtlasResearchFetchController,
  runWithAtlasResearchScope,
  type AtlasResearchFetchController,
  type AtlasResearchProvenance,
  type AtlasResearchScope,
} from "../../../../src/lib/atlas-research-fetch-boundary";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
const ENDPOINT = "https://mock.invalid/v1/chat/completions";

let observedProvenance: Readonly<AtlasResearchProvenance> | undefined;
let localDelegateCalls = 0;
let nativeFetchCalls = 0;
const cloneObservations: Promise<void>[] = [];

const controller: AtlasResearchFetchController = {
  controllerId: "campaign-v6-s1-normalize-scope-review",
  attestCandidateContract(request) {
    observedProvenance = request.scope.provenance;
    return {
      attestationId: "single-question",
      attestationHash: B,
      candidatesPerCompletion: 1,
    };
  },
  preFetchLease() {
    return { leaseId: "local-review-lease" };
  },
  observeResponse() {},
  observeError() {},
  observeClone() {},
  trackCloneObservation(_lease, completion) {
    cloneObservations.push(completion);
  },
};

const provenance: AtlasResearchProvenance = {
  requestedModel: "mock/model",
  effectiveModel: "mock/model",
  plan: "STANDARD",
  stage: "question-generation",
  promptHash: A,
  requestEnvelopeHash: C,
  promptProfileArtifactHash: D,
  schemaHash: B,
  gateHash: A,
  ladderHash: null,
  policyHash: B,
  corpus: { corpusId: "review", rowId: "row", passageHash: C },
  runnerVersion: "review-v1",
  gitVersion: "local-review",
};

const scope: AtlasResearchScope = {
  operationId: "campaign-v6-s1-normalize-scope-review-op",
  purpose: "candidate",
  expectedEndpoint: ENDPOINT,
  expectedCandidateOutputs: 1,
  candidateContract: {
    attestationId: "single-question",
    attestationHash: B,
    expectedCandidatesPerCompletion: 1,
  },
  parentPhysicalCallId: null,
  provenance,
};

async function main(): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    nativeFetchCalls += 1;
    throw new Error("native fetch must not run in the normalizeScope review probe");
  }) as typeof fetch;

  const uninstall = installAtlasResearchFetchController(controller);
  const dispatcher = createAtlasResearchFetchDispatcher(async () => {
    localDelegateCalls += 1;
    return new Response(JSON.stringify({
      id: "local-review-generation",
      model: "mock/model",
      provider: "LocalReview",
      choices: [{ message: { role: "assistant", content: "{}" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost: 0 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  });

  try {
  await runWithAtlasResearchScope(scope, async () => {
    const response = await dispatcher(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        model: "mock/model",
        messages: [{ role: "user", content: "local review" }],
        response_format: {
          type: "json_schema",
          json_schema: {
            schema: {
              type: "object",
              properties: {
                questions: {
                  type: "array",
                  minItems: 1,
                  maxItems: 1,
                  items: { type: "object" },
                },
              },
              required: ["questions"],
              additionalProperties: false,
            },
          },
        },
      }),
    });
    await response.text();
  });
  await Promise.all(cloneObservations);
  assert.deepEqual(observedProvenance, provenance);
  assert.equal(observedProvenance?.requestEnvelopeHash, C);
  assert.equal(observedProvenance?.promptProfileArtifactHash, D);

  await assert.rejects(
    runWithAtlasResearchScope({
      ...scope,
      operationId: `${scope.operationId}-bad-envelope`,
      provenance: { ...provenance, requestEnvelopeHash: "bad" },
    }, async () => undefined),
    /provenance\.requestEnvelopeHash/,
  );
  await assert.rejects(
    runWithAtlasResearchScope({
      ...scope,
      operationId: `${scope.operationId}-bad-profile`,
      provenance: { ...provenance, promptProfileArtifactHash: "bad" },
    }, async () => undefined),
    /provenance\.promptProfileArtifactHash/,
  );
  assert.equal(localDelegateCalls, 1);
  assert.equal(nativeFetchCalls, 0);
  } finally {
    uninstall();
    globalThis.fetch = originalFetch;
  }

  process.stdout.write(`${JSON.stringify({
    verdict: "PASS_NORMALIZE_SCOPE_BINDINGS_ONLY",
    completeProvenancePreserved: true,
    invalidRequestEnvelopeHashRejected: true,
    invalidPromptProfileArtifactHashRejected: true,
    localDelegateCalls,
    nativeFetchCalls,
  })}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
