import { AsyncLocalStorage } from "node:async_hooks";
import assert from "node:assert/strict";
import test from "node:test";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject, generateText } from "ai";
import { z } from "zod";

/**
 * Zero-network probe for ai@6.0.99 + @ai-sdk/openai-compatible@2.0.56.
 *
 * Safety properties:
 * - The provider base URL is the reserved `.invalid` TLD.
 * - Every provider instance receives a custom fetch implementation.
 * - The custom fetch never delegates to globalThis.fetch.
 * - No environment variable is read.
 */

const scopes = new AsyncLocalStorage();
const outputSchema = z.object({ value: z.string() });

function openAiSuccess({
  content,
  id,
  promptTokens = 11,
  completionTokens = 7,
  cost = 0.001,
}) {
  return new Response(
    JSON.stringify({
      id,
      created: 1_750_000_000,
      model: "mock/model",
      provider: "MockProvider",
      choices: [
        {
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
        cost,
      },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

function retryableHttpError(status = 503) {
  return new Response(
    JSON.stringify({
      error: {
        message: `simulated HTTP ${status}`,
        type: "mock_error",
        code: status,
      },
    }),
    {
      status,
      statusText: "Simulated provider failure",
      // Prevent the retry probe from sleeping for the SDK's normal backoff.
      headers: {
        "content-type": "application/json",
        "retry-after-ms": "0",
      },
    },
  );
}

function retryableNetworkError() {
  const error = new TypeError("fetch failed");
  error.cause = new Error("simulated connection reset");
  return error;
}

function summarizeResponseBody(raw) {
  if (typeof raw !== "object" || raw === null) return undefined;
  const usage =
    typeof raw.usage === "object" && raw.usage !== null ? raw.usage : undefined;
  return {
    id: typeof raw.id === "string" ? raw.id : undefined,
    promptTokens:
      usage && typeof usage.prompt_tokens === "number"
        ? usage.prompt_tokens
        : undefined,
    completionTokens:
      usage && typeof usage.completion_tokens === "number"
        ? usage.completion_tokens
        : undefined,
    costUsd: usage && typeof usage.cost === "number" ? usage.cost : undefined,
  };
}

class MockPhysicalBoundary {
  constructor(outcome) {
    this.outcome = outcome;
    this.events = [];
    this.operationOrdinals = new Map();
  }

  fetch = async (input, init) => {
    const scope = scopes.getStore();
    assert.ok(scope, "research provider call must have an AsyncLocalStorage scope");

    const url = String(input);
    assert.match(
      url,
      /^https:\/\/mock\.invalid\/v1\/chat\/completions$/,
      "the probe must never target a routable provider host",
    );

    const ordinal = (this.operationOrdinals.get(scope.operationId) ?? 0) + 1;
    this.operationOrdinals.set(scope.operationId, ordinal);
    const event = {
      physicalCallId: `${scope.operationId}:http:${ordinal}`,
      operationId: scope.operationId,
      purpose: scope.purpose,
      parentPhysicalCallId: scope.parentPhysicalCallId ?? null,
      ordinal,
      method: init?.method,
      requestBody:
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      status: undefined,
      response: undefined,
      error: undefined,
    };
    this.events.push(event);

    try {
      const response = await this.outcome(event, this.events.length - 1);
      assert.ok(response instanceof Response, "mock outcome must return Response");
      event.status = response.status;

      // This is the exact interception pattern under test: clone before returning
      // the untouched response to provider-utils, then independently inspect raw
      // id/usage/cost. The SDK consumes the original response body afterwards.
      const raw = await response
        .clone()
        .json()
        .catch(() => undefined);
      event.response = summarizeResponseBody(raw);
      return response;
    } catch (error) {
      event.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      throw error;
    }
  };
}

function makeModel(boundary) {
  const provider = createOpenAICompatible({
    baseURL: "https://mock.invalid/v1",
    name: "mock-boundary-probe",
    supportsStructuredOutputs: true,
    includeUsage: true,
    fetch: boundary.fetch,
  });
  return provider.chatModel("mock/model");
}

function runScoped(scope, fn) {
  return scopes.run(Object.freeze({ ...scope }), fn);
}

test("generateObject default maxRetries=2 makes and exposes all 3 HTTP attempts", async () => {
  const boundary = new MockPhysicalBoundary((_event, index) => {
    if (index < 2) return retryableHttpError(503);
    return openAiSuccess({
      content: JSON.stringify({ value: "third-attempt" }),
      id: "gen-http-third",
      cost: 0.003,
    });
  });
  const model = makeModel(boundary);

  const result = await runScoped(
    { operationId: "op-http-default", purpose: "candidate_generation" },
    () =>
      generateObject({
        model,
        schema: outputSchema,
        prompt: "Return the object.",
        // Deliberately omitted: maxRetries. ai@6 defaults it to 2.
      }),
  );

  assert.deepEqual(result.object, { value: "third-attempt" });
  assert.equal(boundary.events.length, 3);
  assert.deepEqual(
    boundary.events.map(event => event.status),
    [503, 503, 200],
  );
  assert.deepEqual(
    boundary.events.map(event => event.ordinal),
    [1, 2, 3],
  );
  assert.ok(boundary.events.every(event => event.operationId === "op-http-default"));
  assert.equal(boundary.events[2].response.id, "gen-http-third");
  assert.equal(boundary.events[2].response.costUsd, 0.003);
});

test("retryable network failures also cross custom fetch once per physical attempt", async () => {
  const boundary = new MockPhysicalBoundary((_event, index) => {
    if (index < 2) throw retryableNetworkError();
    return openAiSuccess({
      content: JSON.stringify({ value: "network-recovered" }),
      id: "gen-network-third",
    });
  });
  const model = makeModel(boundary);

  const result = await runScoped(
    { operationId: "op-network-default", purpose: "candidate_generation" },
    () => generateObject({ model, schema: outputSchema, prompt: "Return the object." }),
  );

  assert.deepEqual(result.object, { value: "network-recovered" });
  assert.equal(boundary.events.length, 3);
  assert.deepEqual(
    boundary.events.map(event => Boolean(event.error)),
    [true, true, false],
  );
  assert.deepEqual(
    boundary.events.map(event => event.ordinal),
    [1, 2, 3],
  );
});

test("generateObject maxRetries=0 makes exactly one HTTP request", async () => {
  const boundary = new MockPhysicalBoundary(() => retryableHttpError(503));
  const model = makeModel(boundary);

  await assert.rejects(() =>
    runScoped(
      { operationId: "op-http-no-retry", purpose: "candidate_generation" },
      () =>
        generateObject({
          model,
          schema: outputSchema,
          prompt: "Return the object.",
          maxRetries: 0,
        }),
    ),
  );

  assert.equal(boundary.events.length, 1);
  assert.equal(boundary.events[0].status, 503);
  assert.equal(boundary.events[0].ordinal, 1);
});

test("malformed JSON repair is a separately observable provider request with explicit lineage", async () => {
  const boundary = new MockPhysicalBoundary((_event, index) => {
    if (index === 0) {
      return openAiSuccess({
        content: '{"value":',
        id: "gen-malformed-candidate",
        promptTokens: 13,
        completionTokens: 2,
        cost: 0.0013,
      });
    }
    return openAiSuccess({
      content: JSON.stringify({ value: "repaired" }),
      id: "gen-json-repair",
      promptTokens: 17,
      completionTokens: 5,
      cost: 0.0027,
    });
  });
  const model = makeModel(boundary);
  let repairUsage;

  const result = await runScoped(
    { operationId: "op-repair-explicit", purpose: "candidate_generation" },
    () =>
      generateObject({
        model,
        schema: outputSchema,
        prompt: "Return the object.",
        maxRetries: 0,
        experimental_repairText: async ({ text }) => {
          const inherited = scopes.getStore();
          assert.equal(inherited?.purpose, "candidate_generation");
          const parentPhysicalCallId = boundary.events.at(-1)?.physicalCallId;
          return runScoped(
            {
              operationId: inherited.operationId,
              purpose: "json_repair",
              parentPhysicalCallId,
            },
            async () => {
              const repair = await generateText({
                model,
                prompt: `Repair this JSON: ${text}`,
                maxRetries: 0,
              });
              repairUsage = repair.usage;
              return repair.text;
            },
          );
        },
      }),
  );

  assert.deepEqual(result.object, { value: "repaired" });
  assert.equal(boundary.events.length, 2);
  assert.deepEqual(
    boundary.events.map(event => event.purpose),
    ["candidate_generation", "json_repair"],
  );
  assert.equal(
    boundary.events[1].parentPhysicalCallId,
    boundary.events[0].physicalCallId,
  );
  assert.deepEqual(
    boundary.events.map(event => event.response.id),
    ["gen-malformed-candidate", "gen-json-repair"],
  );
  assert.deepEqual(
    boundary.events.map(event => event.response.costUsd),
    [0.0013, 0.0027],
  );

  // generateObject reports only the original malformed call's usage. The usage
  // of the provider call made inside experimental_repairText is not aggregated.
  assert.equal(result.usage.inputTokens, 13);
  assert.equal(result.usage.outputTokens, 2);
  assert.equal(repairUsage.inputTokens, 17);
  assert.equal(repairUsage.outputTokens, 5);
});

test("ALS alone cannot distinguish repair purpose without an explicit child-scope hook", async () => {
  const boundary = new MockPhysicalBoundary((_event, index) =>
    index === 0
      ? openAiSuccess({
          content: '{"value":',
          id: "gen-implicit-malformed",
        })
      : openAiSuccess({
          content: JSON.stringify({ value: "implicitly-repaired" }),
          id: "gen-implicit-repair",
        }),
  );
  const model = makeModel(boundary);

  const result = await runScoped(
    { operationId: "op-repair-implicit", purpose: "candidate_generation" },
    () =>
      generateObject({
        model,
        schema: outputSchema,
        prompt: "Return the object.",
        maxRetries: 0,
        experimental_repairText: async ({ text }) => {
          const repair = await generateText({
            model,
            prompt: `Repair this JSON: ${text}`,
            maxRetries: 0,
          });
          return repair.text;
        },
      }),
  );

  assert.deepEqual(result.object, { value: "implicitly-repaired" });
  assert.equal(boundary.events.length, 2);
  assert.deepEqual(
    boundary.events.map(event => event.purpose),
    ["candidate_generation", "candidate_generation"],
  );
});

test("AsyncLocalStorage keeps concurrent logical operations isolated at fetch boundary", async () => {
  const boundary = new MockPhysicalBoundary(event =>
    openAiSuccess({
      content: JSON.stringify({ value: event.operationId }),
      id: `gen-${event.operationId}`,
    }),
  );
  const model = makeModel(boundary);

  const [a, b] = await Promise.all([
    runScoped({ operationId: "concurrent-a", purpose: "candidate_generation" }, () =>
      generateObject({
        model,
        schema: outputSchema,
        prompt: "Return A.",
        maxRetries: 0,
      }),
    ),
    runScoped({ operationId: "concurrent-b", purpose: "candidate_generation" }, () =>
      generateObject({
        model,
        schema: outputSchema,
        prompt: "Return B.",
        maxRetries: 0,
      }),
    ),
  ]);

  assert.deepEqual(new Set([a.object.value, b.object.value]), new Set(["concurrent-a", "concurrent-b"]));
  assert.deepEqual(
    new Set(boundary.events.map(event => event.operationId)),
    new Set(["concurrent-a", "concurrent-b"]),
  );
  assert.ok(boundary.events.every(event => event.ordinal === 1));
});

