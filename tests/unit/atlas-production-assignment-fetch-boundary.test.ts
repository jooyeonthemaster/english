import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  QUESTION_GENERATION_ASSIGNMENT_BUDGET_EXHAUSTED,
  QuestionGenerationAssignmentBudgetError,
  createAtlasProductionAssignmentFetchDispatcher,
  runWithAtlasProductionAssignmentScope,
  type AtlasProductionAssignmentFetchController,
  type AtlasProductionCallLease,
  type AtlasProductionErrorEvidence,
  type AtlasProductionLeaseRequest,
  type AtlasProductionResponseEvidence,
} from "../../src/lib/atlas-production-assignment-fetch-boundary";
import { runWithAtlasResearchScope } from "../../src/lib/atlas-research-fetch-boundary";

const HASH = "a".repeat(64);

function scope(jobId = "job-1") {
  return {
    jobId,
    policyVersion: "test-v1",
    policyHash: HASH,
    mode: "ENFORCE" as const,
  };
}

function wireBody() {
  return JSON.stringify({
    model: "google/gemini-3.5-flash",
    messages: [{ role: "user", content: "hello" }],
    max_tokens: 100,
    stream: false,
    n: 1,
    provider: { order: ["Google"], allow_fallbacks: false },
    reasoning: { enabled: false, effort: "none", exclude: true },
  });
}

function controller(overrides: {
  lease?: (request: Readonly<AtlasProductionLeaseRequest>) => AtlasProductionCallLease | Promise<AtlasProductionCallLease>;
  response?: (lease: Readonly<AtlasProductionCallLease>, evidence: Readonly<AtlasProductionResponseEvidence>) => void | Promise<void>;
  error?: (lease: Readonly<AtlasProductionCallLease>, evidence: Readonly<AtlasProductionErrorEvidence>) => void | Promise<void>;
} = {}): AtlasProductionAssignmentFetchController {
  return {
    controllerId: "test-controller",
    preFetchLease: overrides.lease ?? (() => ({ leaseId: "lease-1" })),
    observeResponse: overrides.response ?? (() => undefined),
    observeError: overrides.error ?? (() => undefined),
  };
}

test("no production scope returns the exact delegate promise and arguments", async () => {
  const response = new Response("ok");
  const promise = Promise.resolve(response);
  const input = new URL("https://example.test/chat/completions");
  const init = { method: "POST", body: wireBody() };
  let seenInput: RequestInfo | URL | undefined;
  let seenInit: RequestInit | undefined;
  const dispatcher = createAtlasProductionAssignmentFetchDispatcher((a, b) => {
    seenInput = a;
    seenInit = b;
    return promise;
  });
  const actual = dispatcher(input, init);
  assert.equal(actual, promise);
  assert.equal(seenInput, input);
  assert.equal(seenInit, init);
  assert.equal(await actual, response);
});

test("a committed lease precedes the delegate and wire safety facts are parsed", async () => {
  const order: string[] = [];
  let leasedRequest: Readonly<AtlasProductionLeaseRequest> | undefined;
  const c = controller({
    lease(request) {
      order.push("lease");
      leasedRequest = request;
      return { leaseId: "lease-1" };
    },
  });
  const dispatcher = createAtlasProductionAssignmentFetchDispatcher(async () => {
    order.push("delegate");
    return new Response(JSON.stringify({ usage: { cost: 0.001 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  await runWithAtlasProductionAssignmentScope(scope(), c, () =>
    dispatcher("https://example.test/chat/completions", {
      method: "POST",
      body: wireBody(),
    }),
  );
  assert.deepEqual(order, ["lease", "delegate"]);
  assert.equal(leasedRequest?.request.reasoningOff, true);
  assert.equal(leasedRequest?.request.providerRoutingPinned, true);
  assert.equal(leasedRequest?.request.outputTokenCap, 100);
  assert.equal(leasedRequest?.request.completionCount, 1);
  assert.equal(leasedRequest?.request.textOnly, true);
  assert.equal(leasedRequest?.request.knownCostShape, true);
});

test("the complete wire body exposes modalities, plugins, and unknown cost keys", async () => {
  const textOnly: boolean[] = [];
  const knownCostShape: boolean[] = [];
  const c = controller({
    lease(request) {
      textOnly.push(request.request.textOnly);
      knownCostShape.push(request.request.knownCostShape);
      return { leaseId: `lease-${textOnly.length}` };
    },
  });
  const dispatcher = createAtlasProductionAssignmentFetchDispatcher(async () =>
    new Response("ok"),
  );
  const variants = [
    { modalities: ["audio"], audio: { voice: "alloy" } },
    { plugins: [{ id: "web" }] },
    {
      messages: [
        {
          role: "user",
          content: [{ type: "image_url", image_url: { url: "https://x" } }],
        },
      ],
    },
    { models: ["unpriced/fallback-model"] },
  ];
  for (const [index, extra] of variants.entries()) {
    const body = { ...JSON.parse(wireBody()), ...extra };
    await runWithAtlasProductionAssignmentScope(
      scope(`non-text-${index}`),
      c,
      () =>
        dispatcher("https://example.test/chat/completions", {
          method: "POST",
          body: JSON.stringify(body),
        }),
    );
  }
  assert.deepEqual(textOnly, [false, false, false, true]);
  assert.deepEqual(knownCostShape, [false, false, true, false]);
});

test("an enforcing lease that expires while admission waits never reaches fetch", async () => {
  let delegates = 0;
  const c = controller({
    lease() {
      return {
        leaseId: "expired-price-lease",
        dispatchNotAfterEpochMs: Date.now() - 1,
      };
    },
  });
  const dispatcher = createAtlasProductionAssignmentFetchDispatcher(async () => {
    delegates += 1;
    return new Response("should-not-run");
  });
  await assert.rejects(
    runWithAtlasProductionAssignmentScope(scope(), c, () =>
      dispatcher("https://example.test/chat/completions", {
        method: "POST",
        body: wireBody(),
      }),
    ),
    /PRICE_SNAPSHOT_STALE/,
  );
  assert.equal(delegates, 0);
});

test("100 concurrent assignments at cap 7 produce seven delegate calls", async () => {
  let leases = 0;
  let delegates = 0;
  const c = controller({
    lease() {
      leases += 1;
      if (leases > 7) {
        throw new QuestionGenerationAssignmentBudgetError(
          QUESTION_GENERATION_ASSIGNMENT_BUDGET_EXHAUSTED,
          "test cap reached",
        );
      }
      return { leaseId: `lease-${leases}` };
    },
  });
  const dispatcher = createAtlasProductionAssignmentFetchDispatcher(async () => {
    delegates += 1;
    return new Response("ok");
  });
  const outcomes = await Promise.allSettled(
    Array.from({ length: 100 }, (_, index) =>
      runWithAtlasProductionAssignmentScope(scope(`job-${index}`), c, () =>
        dispatcher("https://example.test/chat/completions", {
          method: "POST",
          body: wireBody(),
        }),
      ),
    ),
  );
  assert.equal(delegates, 7);
  assert.equal(outcomes.filter((row) => row.status === "fulfilled").length, 7);
  assert.equal(outcomes.filter((row) => row.status === "rejected").length, 93);
});

test("response observation failure or hang cannot delay or resend", async () => {
  let delegates = 0;
  const c = controller({
    response: () => new Promise<void>(() => undefined),
  });
  const dispatcher = createAtlasProductionAssignmentFetchDispatcher(async () => {
    delegates += 1;
    return new Response(JSON.stringify({ usage: { cost: 0.01 } }));
  });
  const startedAt = Date.now();
  const response = await runWithAtlasProductionAssignmentScope(scope(), c, () =>
    dispatcher("https://example.test/chat/completions", {
      method: "POST",
      body: wireBody(),
    }),
  );
  assert.equal(await response.text(), JSON.stringify({ usage: { cost: 0.01 } }));
  assert.equal(delegates, 1);
  assert.ok(Date.now() - startedAt < 1_000);
});

test("research and production scopes are rejected at entry", async () => {
  const researchScope = {
    operationId: "mutual-exclusion",
    purpose: "evaluation" as const,
    expectedEndpoint: "https://example.test/chat/completions",
    expectedCandidateOutputs: 0,
    parentPhysicalCallId: null,
    provenance: {
      requestedModel: "google/gemini-3.5-flash",
      effectiveModel: "google/gemini-3.5-flash",
      plan: "STANDARD",
      stage: "evaluation",
      promptHash: HASH,
      schemaHash: null,
      gateHash: null,
      ladderHash: null,
      policyHash: null,
      corpus: null,
      runnerVersion: "test",
      gitVersion: "test",
    },
  };
  await assert.rejects(
    runWithAtlasResearchScope(researchScope, () =>
      runWithAtlasProductionAssignmentScope(scope(), controller(), () => "bad"),
    ),
    /RESEARCH_PRODUCTION_BUDGET_SCOPE_CONFLICT/,
  );
});

test("network errors preserve the original error and are observed once", async () => {
  const original = Object.assign(new TypeError("fetch failed"), {
    code: "ECONNRESET",
  });
  let observed: AtlasProductionErrorEvidence | undefined;
  const c = controller({
    error(_lease, evidence) {
      observed = evidence;
    },
  });
  const dispatcher = createAtlasProductionAssignmentFetchDispatcher(async () => {
    throw original;
  });
  await assert.rejects(
    runWithAtlasProductionAssignmentScope(scope(), c, () =>
      dispatcher("https://example.test/chat/completions", {
        method: "POST",
        body: wireBody(),
      }),
    ),
    (error) => error === original,
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(observed?.errorCode, "ECONNRESET");
});

test("request mutation during lease cannot alter the delegated body", async () => {
  const originalBody = wireBody();
  const init: RequestInit = { method: "POST", body: originalBody };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let delegatedBody: BodyInit | null | undefined;
  const c = controller({
    async lease() {
      await gate;
      return { leaseId: "lease" };
    },
  });
  const dispatcher = createAtlasProductionAssignmentFetchDispatcher(
    async (_input, delegatedInit) => {
      delegatedBody = delegatedInit?.body;
      return new Response("ok");
    },
  );
  const pending = runWithAtlasProductionAssignmentScope(scope(), c, () =>
    dispatcher("https://example.test/chat/completions", init),
  );
  init.body = JSON.stringify({ model: "attacker" });
  release();
  await pending;
  assert.equal(delegatedBody, originalBody);
});

test("provider routing hash is canonical for equivalent object key order", async () => {
  const hashes: string[] = [];
  const c = controller({
    lease(request) {
      hashes.push(request.request.providerRoutingHash);
      return { leaseId: `lease-${hashes.length}` };
    },
  });
  const dispatcher = createAtlasProductionAssignmentFetchDispatcher(async () =>
    new Response("ok"),
  );
  const first = JSON.parse(wireBody()) as Record<string, unknown>;
  const second = { ...first, provider: { allow_fallbacks: false, order: ["Google"] } };
  await runWithAtlasProductionAssignmentScope(scope("a"), c, () =>
    dispatcher("https://example.test/chat/completions", {
      method: "POST",
      body: JSON.stringify(first),
    }),
  );
  await runWithAtlasProductionAssignmentScope(scope("b"), c, () =>
    dispatcher("https://example.test/chat/completions", {
      method: "POST",
      body: JSON.stringify(second),
    }),
  );
  assert.equal(hashes[0], hashes[1]);
  assert.equal(hashes[0]?.length, createHash("sha256").digest().length * 2);
});
