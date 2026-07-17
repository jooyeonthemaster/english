import assert from "node:assert/strict";
import test from "node:test";

import { generateText } from "ai";

import {
  runWithAtlasProductionAssignmentScope,
  type AtlasProductionAssignmentFetchController,
  type AtlasProductionLeaseRequest,
} from "../../src/lib/atlas-production-assignment-fetch-boundary";

test("the real Atlas SDK wire is leased once with Gemini reasoning disabled", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "offline-test-key";
  let delegates = 0;
  let leaseRequest: Readonly<AtlasProductionLeaseRequest> | undefined;
  globalThis.fetch = async () => {
    delegates += 1;
    return new Response(
      JSON.stringify({
        id: "offline-generation",
        model: "google/gemini-3.5-flash",
        provider: "Offline",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: { role: "assistant", content: "offline ok" },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 2,
          total_tokens: 12,
          cost: 0.00001,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const { atlasChatModel } = await import("../../src/lib/atlas-ai");
    const controller: AtlasProductionAssignmentFetchController = {
      controllerId: "wire-test-controller",
      preFetchLease(request) {
        leaseRequest = request;
        return { leaseId: "wire-lease" };
      },
      observeResponse() {},
      observeError() {},
    };
    const result = await runWithAtlasProductionAssignmentScope(
      {
        jobId: "wire-job",
        policyVersion: "wire-v1",
        policyHash: "a".repeat(64),
        mode: "AUDIT",
      },
      controller,
      () =>
        generateText({
          model: atlasChatModel("google/gemini-3.5-flash"),
          prompt: "offline wire probe",
          maxRetries: 0,
          maxOutputTokens: 64,
        }),
    );
    assert.equal(result.text, "offline ok");
    assert.equal(delegates, 1);
    assert.equal(leaseRequest?.request.model, "google/gemini-3.5-flash");
    assert.equal(leaseRequest?.request.outputTokenCap, 64);
    assert.equal(leaseRequest?.request.reasoningOff, true);
    assert.equal(leaseRequest?.request.stream, false);
    assert.equal(leaseRequest?.request.textOnly, true);
    assert.equal(leaseRequest?.request.knownCostShape, true);
    // Ordinary production currently leaves OpenRouter routing automatic. An
    // enforcing policy must therefore attest the all-upstream maximum price.
    assert.equal(leaseRequest?.request.providerRoutingPinned, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});
