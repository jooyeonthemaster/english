import assert from "node:assert/strict";
import test from "node:test";

import { generateObject, generateText } from "ai";
import { z } from "zod";

import {
  ATLAS_RESEARCH_OPENROUTER_PROVIDER_ROUTING,
  atlasChatModel,
} from "@/lib/atlas-ai";
import { getAiResponseSchema } from "@/lib/question-ai-schemas-mc";
import { buildResearchAwareQuestionResponseSchema } from "@/lib/question-generation-research-schema";
import {
  QUESTION_GENERATION_RESEARCH_STAGES,
  QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY,
  runQuestionGenerationResearchStage,
  runWithQuestionGenerationResearchRuntime,
  type QuestionGenerationResearchOperation,
  type QuestionGenerationResearchRuntime,
  type QuestionGenerationResearchStage,
} from "@/lib/question-generation-research-runtime";

class WireProbeRuntime implements QuestionGenerationResearchRuntime {
  readonly runtimeId: string;
  readonly retryPolicy =
    QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY;

  constructor(readonly expectedQuestionsPerStructuredCall: number) {
    this.runtimeId = `phase-c-wire-${expectedQuestionsPerStructuredCall}`;
  }

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

interface WireCapture {
  body: Record<string, unknown>;
  schema: Record<string, unknown>;
}

function questionsSchema(value: Record<string, unknown>): Record<string, unknown> {
  const responseFormat = value.response_format as {
    json_schema?: { schema?: { properties?: { questions?: unknown } } };
  };
  const questions = responseFormat?.json_schema?.schema?.properties?.questions;
  assert.ok(questions && typeof questions === "object");
  return questions as Record<string, unknown>;
}

async function captureActualAtlasWire(count?: number): Promise<WireCapture> {
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;
  let delegateCalls = 0;
  const sentinel = new Error(`phase-c-wire-stop-${count ?? "ordinary"}`);
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    delegateCalls += 1;
    const body = init?.body;
    if (typeof body !== "string") {
      throw new Error("Phase-C wire probe expected an inline JSON body");
    }
    capturedBody = JSON.parse(body) as Record<string, unknown>;
    throw sentinel;
  }) as typeof fetch;

  const invoke = async () => {
    const schema = getAiResponseSchema("BLANK_INFERENCE");
    try {
      await generateObject({
        model: atlasChatModel("google/gemini-3.5-flash"),
        schema,
        prompt: "Phase-C zero-network structured cardinality probe",
        maxRetries: 0,
      });
    } catch {
      // The delegate sentinel intentionally stops before external I/O.
    }
    return z.toJSONSchema(schema) as Record<string, unknown>;
  };

  try {
    const schema = count === undefined
      ? await invoke()
      : await runWithQuestionGenerationResearchRuntime(
          new WireProbeRuntime(count),
          invoke,
        );
    assert.equal(delegateCalls, 1);
    assert.ok(capturedBody);
    return { body: capturedBody, schema };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("actual Atlas wire is exact only inside the opted-in research runtime", async () => {
  assert.equal(
    getAiResponseSchema("BLANK_INFERENCE").safeParse({ questions: [] }).success,
    true,
  );
  const ordinary = await captureActualAtlasWire();
  const fixedOne = await captureActualAtlasWire(1);
  const fixedThree = await captureActualAtlasWire(3);

  const ordinaryWireQuestions = questionsSchema(ordinary.body);
  assert.equal(ordinaryWireQuestions.minItems, undefined);
  assert.equal(ordinaryWireQuestions.maxItems, undefined);
  assert.equal(Object.hasOwn(ordinary.body, "provider"), false);

  for (const [capture, count] of [
    [fixedOne, 1],
    [fixedThree, 3],
  ] as const) {
    const wireQuestions = questionsSchema(capture.body);
    assert.equal(wireQuestions.minItems, count);
    assert.equal(wireQuestions.maxItems, count);
    assert.deepEqual(
      capture.body.provider,
      ATLAS_RESEARCH_OPENROUTER_PROVIDER_ROUTING,
    );

    const schemaQuestions = (
      capture.schema.properties as { questions: Record<string, unknown> }
    ).questions;
    assert.equal(schemaQuestions.minItems, count);
    assert.equal(schemaQuestions.maxItems, count);
  }
});

test("invalid sealed counts reject before callback and no-runtime stage identity is exact", async () => {
  for (const count of [0, -1, Number.MAX_SAFE_INTEGER + 1, 1.5]) {
    let callbacks = 0;
    await assert.rejects(
      () => runWithQuestionGenerationResearchRuntime(
        new WireProbeRuntime(count),
        () => {
          callbacks += 1;
        },
      ),
      /positive safe integer/,
    );
    assert.equal(callbacks, 0);
  }

  const exactPromise = Promise.resolve({ ordinary: true });
  const returned = runQuestionGenerationResearchStage(
    {
      key: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
      purpose: "candidate",
    },
    () => exactPromise,
  );
  assert.equal(returned, exactPromise);
});

test("the alternate structured wrapper shares the same opt-in cardinality rule", async () => {
  const item = z.object({ value: z.string() });
  const ordinary = z.toJSONSchema(
    buildResearchAwareQuestionResponseSchema(item),
  ) as unknown as { properties: { questions: Record<string, unknown> } };
  assert.equal(ordinary.properties.questions.minItems, undefined);
  assert.equal(ordinary.properties.questions.maxItems, undefined);

  const fixed = await runWithQuestionGenerationResearchRuntime(
    new WireProbeRuntime(2),
    () => z.toJSONSchema(
      buildResearchAwareQuestionResponseSchema(item),
    ) as unknown as { properties: { questions: Record<string, unknown> } },
  );
  assert.equal(fixed.properties.questions.minItems, 2);
  assert.equal(fixed.properties.questions.maxItems, 2);
});

test("research opt-in does not add require_parameters to a plain-text request", async () => {
  const originalFetch = globalThis.fetch;
  let captured: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body;
    if (typeof body !== "string") throw new Error("expected inline JSON body");
    captured = JSON.parse(body) as Record<string, unknown>;
    throw new Error("phase-c-plain-text-stop");
  }) as typeof fetch;
  try {
    await runWithQuestionGenerationResearchRuntime(
      new WireProbeRuntime(1),
      async () => {
        await assert.rejects(
          () => generateText({
            model: atlasChatModel("google/gemini-3.5-flash"),
            prompt: "Phase-C plain-text negative control",
            maxRetries: 0,
          }),
        );
      },
    );
    assert.ok(captured);
    assert.equal(Object.hasOwn(captured, "response_format"), false);
    assert.equal(Object.hasOwn(captured, "provider"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
