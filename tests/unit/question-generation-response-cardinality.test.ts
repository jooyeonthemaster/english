import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { generateObject } from "ai";
import { z } from "zod";

import { atlasChatModel } from "@/lib/atlas-ai";
import {
  AI_QUESTION_SCHEMAS,
  getAiResponseSchema,
} from "@/lib/question-ai-schemas-mc";
import {
  buildResearchAwareQuestionResponseSchema,
} from "@/lib/question-generation-research-schema";
import {
  QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY,
  runWithQuestionGenerationResearchRuntime,
  type QuestionGenerationResearchOperation,
  type QuestionGenerationResearchRuntime,
  type QuestionGenerationResearchStage,
} from "@/lib/question-generation-research-runtime";
import { QUESTION_SCHEMAS } from "@/lib/question-schemas";

class CardinalityProbeRuntime implements QuestionGenerationResearchRuntime {
  readonly runtimeId = "response-cardinality-probe";
  readonly retryPolicy =
    QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY;

  constructor(readonly expectedQuestionsPerStructuredCall: number) {}

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

function questionArrayBounds(schema: z.ZodType): {
  minItems?: number;
  maxItems?: number;
} {
  const jsonSchema = z.toJSONSchema(schema) as {
    properties?: { questions?: { minItems?: number; maxItems?: number } };
  };
  assert.ok(jsonSchema.properties?.questions);
  return jsonSchema.properties.questions;
}

test("server-owned production count emits equal minItems/maxItems", () => {
  const item = z.object({ value: z.string() });
  const ordinary = buildResearchAwareQuestionResponseSchema(item);
  const exact = buildResearchAwareQuestionResponseSchema(item, {
    expectedQuestionCount: 3,
  });

  assert.deepEqual(questionArrayBounds(ordinary), {
    type: "array",
    items: {
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
      additionalProperties: false,
    },
  });
  assert.equal(questionArrayBounds(exact).minItems, 3);
  assert.equal(questionArrayBounds(exact).maxItems, 3);
  assert.equal(exact.safeParse({ questions: [] }).success, false);
  assert.equal(
    exact.safeParse({
      questions: [{ value: "a" }, { value: "b" }, { value: "c" }],
    }).success,
    true,
  );
});

test("invalid or conflicting exact counts fail before schema use", async () => {
  const item = z.object({ value: z.string() });
  for (const count of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () =>
        buildResearchAwareQuestionResponseSchema(item, {
          expectedQuestionCount: count,
        }),
      /positive safe integer/,
    );
  }

  await assert.rejects(
    () =>
      runWithQuestionGenerationResearchRuntime(
        new CardinalityProbeRuntime(2),
        () =>
          buildResearchAwareQuestionResponseSchema(item, {
            expectedQuestionCount: 1,
          }),
      ),
    /differs from sealed research count/,
  );
});

test("every active English Workbench type has an exact structured path", () => {
  const rubric = JSON.parse(
    readFileSync(
      "experiments/question-quality-20260715/design/all-types-evaluation-rubric-v1/rubric.json",
      "utf8",
    ),
  ) as { types: Record<string, unknown> };
  const activeTypes = Object.keys(rubric.types);
  assert.equal(activeTypes.length, 25);

  const uncovered = activeTypes.filter(
    (typeId) => !AI_QUESTION_SCHEMAS[typeId] && !QUESTION_SCHEMAS[typeId],
  );
  assert.deepEqual(uncovered, []);

  for (const typeId of activeTypes) {
    const schema = AI_QUESTION_SCHEMAS[typeId]
      ? getAiResponseSchema(typeId, { expectedQuestionCount: 2 })
      : buildResearchAwareQuestionResponseSchema(QUESTION_SCHEMAS[typeId], {
          expectedQuestionCount: 2,
        });
    const bounds = questionArrayBounds(schema);
    assert.equal(bounds.minItems, 2, `${typeId} minItems`);
    assert.equal(bounds.maxItems, 2, `${typeId} maxItems`);
  }
});

test("the Workbench production builder passes its normalized plan count to both structured branches", () => {
  const source = readFileSync(
    "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
    "utf8",
  );
  assert.match(
    source,
    /getAiResponseSchema\(subType,[\s\S]*?expectedQuestionCount: expectedTypeCount/,
  );
  assert.match(
    source,
    /buildResearchAwareQuestionResponseSchema\([\s\S]*?QUESTION_SCHEMAS\[subType\],[\s\S]*?expectedQuestionCount: expectedTypeCount/,
  );
});

test("server-owned exact count reaches the ordinary Atlas JSON-schema wire", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body;
    if (typeof body !== "string") {
      throw new Error("cardinality probe expected an inline JSON request body");
    }
    capturedBody = JSON.parse(body) as Record<string, unknown>;
    throw new Error("cardinality-wire-stop-before-network");
  }) as typeof fetch;

  try {
    await assert.rejects(() =>
      generateObject({
        model: atlasChatModel("google/gemini-3.5-flash"),
        schema: getAiResponseSchema("BLANK_INFERENCE", {
          expectedQuestionCount: 2,
        }),
        prompt: "zero-network production cardinality probe",
        maxRetries: 0,
      }),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(capturedBody);
  const responseFormat = capturedBody.response_format as {
    type?: unknown;
    json_schema?: {
      schema?: {
        properties?: {
          questions?: { minItems?: number; maxItems?: number };
        };
      };
    };
  };
  assert.equal(responseFormat.type, "json_schema");
  assert.equal(
    responseFormat.json_schema?.schema?.properties?.questions?.minItems,
    2,
  );
  assert.equal(
    responseFormat.json_schema?.schema?.properties?.questions?.maxItems,
    2,
  );
  // Provider hard-enforcement remains a separately audited policy decision.
  assert.equal(Object.hasOwn(capturedBody, "provider"), false);
});
